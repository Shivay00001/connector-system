from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from database import Base

class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, index=True)
    value = Column(String(500))

class ExecutionLog(Base):
    __tablename__ = "execution_logs"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(50), unique=True, index=True)
    pipeline_json = Column(Text) # The original pipeline definition
    status = Column(String(20)) # pending, running, success, error
    current_step = Column(Integer, default=0)
    result_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
