'use client';

import { useState, useEffect } from 'react';

const PRESETS = [
  { name: 'Data Scientist (8001)', endpoint: 'http://localhost:8001/api/execute', poll: 'http://localhost:8001/api/tasks/' },
  { name: 'Data Analyst (8002)', endpoint: 'http://localhost:8002/api/execute', poll: 'http://localhost:8002/api/tasks/' },
  { name: 'Software Engineer (8003)', endpoint: 'http://localhost:8003/api/execute', poll: 'http://localhost:8003/api/tasks/' },
  { name: 'Email AI (8004)', endpoint: 'http://localhost:8004/api/execute', poll: 'http://localhost:8004/api/tasks/' },
  { name: 'WhatsApp AI (8005)', endpoint: 'http://localhost:8005/api/execute', poll: 'http://localhost:8005/api/tasks/' },
  { name: 'Calling AI (8006)', endpoint: 'http://localhost:8006/api/execute', poll: 'http://localhost:8006/api/tasks/' },
  { name: 'Ads Runner (8007)', endpoint: 'http://localhost:8007/api/execute', poll: 'http://localhost:8007/api/tasks/' },
  { name: 'Social Media (8008)', endpoint: 'http://localhost:8008/api/execute', poll: 'http://localhost:8008/api/tasks/' },
  { name: 'SEO Master (8009)', endpoint: 'http://localhost:8009/api/execute', poll: 'http://localhost:8009/api/tasks/' },
  { name: 'Website Optimizer (8010)', endpoint: 'http://localhost:8010/api/execute', poll: 'http://localhost:8010/api/tasks/' }
];

export default function Home() {
  const [provider, setProvider] = useState('gpt-4o');
  const [keys, setKeys] = useState({ openai: '', anthropic: '', gemini: '', glm: '' });
  
  const [pipeline, setPipeline] = useState([
    { name: '', endpoint: '', poll_endpoint: '', initial_payload: '{\n  \n}', mapping_prompt: '' }
  ]);

  const [status, setStatus] = useState<'idle' | 'pending' | 'running' | 'success' | 'error'>('idle');
  const [taskId, setTaskId] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [resultData, setResultData] = useState<any>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setKeys({
      openai: localStorage.getItem('connector_openai_key') || '',
      anthropic: localStorage.getItem('connector_anthropic_key') || '',
      gemini: localStorage.getItem('connector_gemini_key') || '',
      glm: localStorage.getItem('connector_glm_key') || ''
    });

    let interval: NodeJS.Timeout;
    if (taskId && (status === 'pending' || status === 'running')) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:8012/api/tasks/${taskId}`);
          if (res.ok) {
            const data = await res.json();
            setStatus(data.status);
            setCurrentStep(data.current_step);
            
            if (data.status === 'success') {
              setResultData(data.result);
              setMessage('Pipeline execution complete!');
            } else if (data.status === 'error') {
              setResultData(data.result);
              setMessage('Pipeline failed during execution.');
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [taskId, status]);

  const addNode = () => {
    setPipeline([...pipeline, { name: '', endpoint: '', poll_endpoint: '', initial_payload: '{\n  \n}', mapping_prompt: '' }]);
  };

  const removeNode = (index: number) => {
    const newPipeline = [...pipeline];
    newPipeline.splice(index, 1);
    setPipeline(newPipeline);
  };

  const handleNodeChange = (index: number, field: string, value: string) => {
    const newPipeline = [...pipeline];
    if (field === 'preset') {
      const preset = PRESETS.find(p => p.name === value);
      if (preset) {
        newPipeline[index].name = preset.name;
        newPipeline[index].endpoint = preset.endpoint;
        newPipeline[index].poll_endpoint = preset.poll;
      }
    } else {
      newPipeline[index] = { ...newPipeline[index], [field]: value };
    }
    setPipeline(newPipeline);
  };

  const handleExecute = async () => {
    setStatus('pending');
    setMessage('Orchestrating pipeline...');
    setResultData(null);
    setCurrentStep(0);
    
    try {
      localStorage.setItem('connector_openai_key', keys.openai);
      localStorage.setItem('connector_anthropic_key', keys.anthropic);
      localStorage.setItem('connector_gemini_key', keys.gemini);
      localStorage.setItem('connector_glm_key', keys.glm);

      // parse payloads
      const formattedPipeline = pipeline.map(node => {
        let payload = {};
        try {
          payload = JSON.parse(node.initial_payload || '{}');
        } catch (e) {
          console.warn('Invalid JSON in payload for', node.name);
        }
        return {
          ...node,
          initial_payload: payload
        };
      });

      const res = await fetch('http://localhost:8012/api/execute', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-OpenAI-Key': keys.openai,
          'X-Anthropic-Key': keys.anthropic,
          'X-Gemini-Key': keys.gemini,
          'X-GLM-Key': keys.glm,
        },
        body: JSON.stringify({
          provider: provider,
          pipeline: formattedPipeline
        }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setTaskId(data.task_id);
      } else {
        setStatus('error');
        setMessage('Failed to start pipeline task.');
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
      setMessage('Network error. Ensure backend is running.');
    }
  };

  return (
    <main className="dashboard-container">
      <div className="dashboard-header">
        <h1>Connector System</h1>
        <p style={{fontSize: '1.2rem', color: '#64748b', marginTop: '10px'}}>Dynamic Multi-Agent Pipeline Orchestrator</p>
      </div>

      <div style={{display: 'flex', gap: '30px', flexWrap: 'wrap'}}>
        <div style={{flex: '1 1 450px'}}>
          <div className="panel">
            <h2 className="panel-title">Universal API Gateway</h2>
            
            <div className="form-group"><label>OpenAI</label><input type="password" value={keys.openai} onChange={(e) => setKeys({...keys, openai: e.target.value})} /></div>
            <div className="form-group"><label>Anthropic</label><input type="password" value={keys.anthropic} onChange={(e) => setKeys({...keys, anthropic: e.target.value})} /></div>
            <div className="form-group"><label>Google GenAI</label><input type="password" value={keys.gemini} onChange={(e) => setKeys({...keys, gemini: e.target.value})} /></div>
            <div className="form-group"><label>ZhipuAI (GLM)</label><input type="password" value={keys.glm} onChange={(e) => setKeys({...keys, glm: e.target.value})} /></div>

            <div className="form-group" style={{marginTop: '20px'}}>
              <label style={{color: 'var(--primary)'}}>Data Mapping LLM Engine</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={status === 'pending' || status === 'running'}>
                <option value="gpt-4o">OpenAI (gpt-4o)</option>
                <option value="claude-3-5-sonnet-20240620">Anthropic (claude-3-5-sonnet)</option>
                <option value="gemini/gemini-1.5-pro">Google AI (gemini-1.5-pro)</option>
                <option value="zhipu/glm-4">ZhipuAI (glm-4)</option>
                <option value="ollama/llama3">Local Ollama (Llama 3)</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{flex: '2 1 600px'}}>
          <div className="panel" style={{height: '100%'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px'}}>
              <h2 className="panel-title" style={{border: 'none', margin: 0, padding: 0}}>Pipeline Builder</h2>
              <button className="btn btn-secondary" onClick={addNode}>+ Add Agent Node</button>
            </div>
            
            {pipeline.map((node, index) => (
              <div key={index}>
                {index > 0 && (
                  <div className="node-connector">
                    <span>⬇️ LLM Translation mapping Output {index} to Input {index + 1}</span>
                    <div style={{width: '80%', margin: '10px auto'}}>
                      <textarea 
                        value={node.mapping_prompt}
                        onChange={e => handleNodeChange(index, 'mapping_prompt', e.target.value)}
                        placeholder={`Instructions for mapping data to Node ${index + 1} payload... (e.g. 'Extract the keywords and set them as target_query')`}
                        rows={2}
                        style={{width: '100%', padding: '10px', fontSize: '0.85rem', border: '1px dashed var(--primary)'}}
                      />
                    </div>
                  </div>
                )}
                
                <div className="node-card">
                  <div style={{display: 'flex', justifyContent: 'space-between'}}>
                    <h3 style={{margin: '0 0 15px 0', color: 'var(--text-color)'}}>Node {index + 1}</h3>
                    {pipeline.length > 1 && <button onClick={() => removeNode(index)} style={{background: 'none', border: 'none', color: 'red', cursor: 'pointer'}}>Remove</button>}
                  </div>
                  
                  <div className="form-group">
                    <label>Agent Preset</label>
                    <select onChange={(e) => handleNodeChange(index, 'preset', e.target.value)}>
                      <option value="">-- Select Pre-configured Agent --</option>
                      {PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  
                  <div style={{display: 'flex', gap: '10px'}}>
                    <div className="form-group" style={{flex: 1}}>
                      <label>Node Name</label>
                      <input type="text" value={node.name} onChange={e => handleNodeChange(index, 'name', e.target.value)} />
                    </div>
                    <div className="form-group" style={{flex: 1}}>
                      <label>Execute Endpoint</label>
                      <input type="text" value={node.endpoint} onChange={e => handleNodeChange(index, 'endpoint', e.target.value)} />
                    </div>
                    <div className="form-group" style={{flex: 1}}>
                      <label>Poll Endpoint</label>
                      <input type="text" value={node.poll_endpoint} onChange={e => handleNodeChange(index, 'poll_endpoint', e.target.value)} />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Base Payload (JSON Schema / Initial State)</label>
                    <textarea 
                      value={node.initial_payload}
                      onChange={e => handleNodeChange(index, 'initial_payload', e.target.value)}
                      rows={4}
                      style={{fontFamily: 'monospace', fontSize: '0.85rem'}}
                    />
                    <small style={{color: '#64748b'}}>For Node 1, this is the exact payload sent. For subsequent nodes, this acts as the target schema the LLM mapper must satisfy.</small>
                  </div>
                </div>
              </div>
            ))}
            
            <button className="btn" onClick={handleExecute} style={{width: '100%', marginTop: '20px', padding: '15px', fontSize: '1.1rem'}} disabled={status === 'pending' || status === 'running'}>
              🚀 Execute Pipeline
            </button>
            
            {status !== 'idle' && (
              <div className={`status-message ${status}`} style={{marginTop: '20px'}}>
                {status === 'running' && <strong>Executing Node {currentStep} of {pipeline.length}... </strong>}
                {message}
              </div>
            )}
            
            {resultData && status === 'success' && (
              <div style={{marginTop: '30px', padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px'}}>
                <h3 style={{marginTop: 0, color: 'var(--primary)'}}>Pipeline Results</h3>
                {resultData.map((res: any, idx: number) => (
                  <div key={idx} style={{marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0'}}>
                    <h4>Node {idx + 1}: {res.step}</h4>
                    <details>
                      <summary style={{cursor: 'pointer', color: '#475569'}}>View Input Payload</summary>
                      <pre style={{background: '#1e293b', color: '#f8fafc', padding: '10px', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto'}}>
                        {JSON.stringify(res.input_payload, null, 2)}
                      </pre>
                    </details>
                    <details open style={{marginTop: '10px'}}>
                      <summary style={{cursor: 'pointer', color: '#475569'}}>View Output</summary>
                      <pre style={{background: '#1e293b', color: '#10b981', padding: '10px', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto'}}>
                        {JSON.stringify(res.output, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
            
            {resultData && status === 'error' && (
              <div style={{marginTop: '30px', padding: '20px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b'}}>
                <h3>Execution Error</h3>
                <pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(resultData, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
