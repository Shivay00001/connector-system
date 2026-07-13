import os
import uuid
import json
import asyncio
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from dotenv import load_dotenv
from pydantic import BaseModel
import litellm

from database import engine, Base, SessionLocal, get_db
from models import Setting, ExecutionLog

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_api_key_for_model(model_id: str, api_keys: dict):
    if model_id.startswith("gpt"):
        return api_keys.get("openai") or os.getenv("OPENAI_API_KEY")
    elif model_id.startswith("claude"):
        return api_keys.get("anthropic") or os.getenv("ANTHROPIC_API_KEY")
    elif model_id.startswith("gemini"):
        return api_keys.get("gemini") or os.getenv("GEMINI_API_KEY")
    elif model_id.startswith("zhipu"):
        return api_keys.get("glm") or os.getenv("ZHIPUAI_API_KEY")
    return None

async def llm_map_data(previous_output: dict, target_payload_schema: dict, mapping_prompt: str, provider: str, api_keys: dict):
    api_key = get_api_key_for_model(provider, api_keys)
    api_base = "http://localhost:11434" if provider.startswith("ollama") else None
    
    schema_str = json.dumps(target_payload_schema, indent=2)
    output_str = json.dumps(previous_output, indent=2)
    
    system_prompt = (
        "You are an expert Data Mapper for an AI pipeline. "
        "Your job is to transform the provided 'Previous Output JSON' into the required 'Target Payload Schema JSON' based on the user's mapping instructions.\n"
        "You must output ONLY a valid JSON object matching the exact keys of the Target Payload Schema. Do not include markdown fences.\n"
        f"TARGET PAYLOAD SCHEMA:\n{schema_str}"
    )
    
    user_prompt = f"Previous Output JSON:\n{output_str}\n\nMapping Instructions: {mapping_prompt}"
    
    response = await litellm.acompletion(
        model=provider,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        api_key=api_key,
        api_base=api_base,
        max_tokens=2000
    )
    
    raw_text = response.choices[0].message.content.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.startswith("```"):
        raw_text = raw_text[3:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]
        
    return json.loads(raw_text)

async def process_pipeline(task_id: str, pipeline_data: list, provider: str, api_keys: dict):
    async with SessionLocal() as db:
        try:
            result = await db.execute(select(ExecutionLog).where(ExecutionLog.task_id == task_id))
            log = result.scalar_one()
            log.status = "running"
            await db.commit()
            
            current_data = None
            final_results = []
            
            headers = {
                "X-OpenAI-Key": api_keys.get("openai") or "mock",
                "X-Anthropic-Key": api_keys.get("anthropic") or "mock",
                "X-Gemini-Key": api_keys.get("gemini") or "mock",
                "X-GLM-Key": api_keys.get("glm") or "mock",
                "Content-Type": "application/json"
            }
            
            for step_index, step in enumerate(pipeline_data):
                payload = step.get("initial_payload", {})
                
                # If there's a mapping prompt and previous data, transform the payload dynamically
                if step_index > 0 and step.get("mapping_prompt") and current_data:
                    mapped_payload = await llm_map_data(current_data, payload, step["mapping_prompt"], provider, api_keys)
                    payload = mapped_payload
                
                # Execute agent
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(step["endpoint"], json=payload, headers=headers)
                    resp.raise_for_status()
                    task_resp = resp.json()
                    agent_task_id = task_resp.get("task_id")
                    if not agent_task_id:
                        raise Exception("Agent did not return a task_id")
                        
                # Poll agent
                agent_result = None
                while True:
                    await asyncio.sleep(3)
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        poll_resp = await client.get(f"{step['poll_endpoint']}{agent_task_id}")
                        poll_data = poll_resp.json()
                        if poll_data.get("status") == "success":
                            agent_result = poll_data
                            break
                        elif poll_data.get("status") == "error":
                            raise Exception(f"Agent Node '{step.get('name', 'Unknown')}' failed.")
                
                current_data = agent_result
                final_results.append({
                    "step": step.get("name"),
                    "input_payload": payload,
                    "output": current_data
                })
                
                # Update progress
                log.current_step = step_index + 1
                await db.commit()
                
            log.status = "success"
            log.result_json = json.dumps(final_results)
            await db.commit()
            
        except Exception as e:
            print(f"Error processing pipeline: {e}")
            result = await db.execute(select(ExecutionLog).where(ExecutionLog.task_id == task_id))
            log = result.scalar_one_or_none()
            if log:
                log.status = "error"
                log.result_json = json.dumps({"error": str(e)})
                await db.commit()

class ExecuteRequest(BaseModel):
    provider: str
    pipeline: list

@app.post("/api/execute")
async def enqueue_pipeline(req: ExecuteRequest, background_tasks: BackgroundTasks, request: Request, db: AsyncSession = Depends(get_db)):
    task_id = str(uuid.uuid4())
    
    log = ExecutionLog(
        task_id=task_id,
        pipeline_json=json.dumps(req.pipeline),
        status="pending",
        current_step=0
    )
    db.add(log)
    await db.commit()
    
    api_keys = {
        "openai": request.headers.get("X-OpenAI-Key"),
        "anthropic": request.headers.get("X-Anthropic-Key"),
        "gemini": request.headers.get("X-Gemini-Key"),
        "glm": request.headers.get("X-GLM-Key")
    }
    
    background_tasks.add_task(process_pipeline, task_id, req.pipeline, req.provider, api_keys)
    
    return {"status": "success", "task_id": task_id}

@app.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExecutionLog).where(ExecutionLog.task_id == task_id))
    log = result.scalar_one_or_none()
    
    if not log:
        raise HTTPException(status_code=404, detail="Task not found")
        
    result_data = None
    if log.result_json:
        try:
            result_data = json.loads(log.result_json)
        except:
            pass
            
    return {
        "status": log.status,
        "current_step": log.current_step,
        "result": result_data
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8012, reload=True)
