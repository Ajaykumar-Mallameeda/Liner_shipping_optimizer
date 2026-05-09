"""
API routes for pipeline control and status
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# Pipeline state storage
pipeline_state = {
    "status": "idle",
    "current_iteration": 0,
    "total_iterations": 0,
    "start_time": None,
    "end_time": None,
    "current_stage": None,
    "stages": [
        {"id": "analysis", "name": "Problem Analysis", "status": "pending"},
        {"id": "regional", "name": "Regional Optimization", "status": "pending"},
        {"id": "coordinator", "name": "Coordinator Agent", "status": "pending"},
        {"id": "milp", "name": "MILP Optimization", "status": "pending"},
        {"id": "deployment", "name": "Vessel Deployment", "status": "pending"}
    ]
}

class PipelineConfig(BaseModel):
    max_iterations: int = 3
    convergence_threshold: float = 0.95
    optimization_type: str = "hybrid"
    regions: Optional[List[str]] = None
    enable_feedback: bool = True

@router.get("/status")
async def get_pipeline_status():
    """Get current pipeline status"""
    return {
        "state": pipeline_state,
        "timestamp": datetime.utcnow().isoformat()
    }

@router.post("/start")
async def start_pipeline(config: PipelineConfig, background_tasks: BackgroundTasks):
    """Start the optimization pipeline"""
    if pipeline_state["status"] == "running":
        raise HTTPException(status_code=400, detail="Pipeline is already running")

    # Update state
    pipeline_state.update({
        "status": "running",
        "current_iteration": 0,
        "total_iterations": config.max_iterations,
        "start_time": datetime.utcnow().isoformat(),
        "end_time": None,
        "config": config.dict()
    })

    # Start pipeline in background
    background_tasks.add_task(run_pipeline_background, config)

    return {
        "message": "Pipeline started",
        "pipeline_id": f"pipeline_{datetime.utcnow().timestamp()}",
        "config": config.dict()
    }

@router.post("/stop")
async def stop_pipeline():
    """Stop the running pipeline"""
    if pipeline_state["status"] != "running":
        raise HTTPException(status_code=400, detail="Pipeline is not running")

    pipeline_state.update({
        "status": "stopped",
        "end_time": datetime.utcnow().isoformat()
    })

    return {
        "message": "Pipeline stopped",
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/iterations")
async def get_iterations():
    """Get iteration history"""
    # Mock iteration data
    iterations = [
        {
            "iteration": 0,
            "profit": 740786392,
            "coverage": 64.7,
            "cost": 145234876,
            "services": 450,
            "convergence_score": 0.975,
            "needs_rerun": True,
            "rerun_reason": "Coverage below threshold",
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "iteration": 1,
            "profit": 756432109,
            "coverage": 66.2,
            "cost": 143987654,
            "services": 458,
            "convergence_score": 0.982,
            "needs_rerun": True,
            "rerun_reason": "Profit margin low",
            "timestamp": datetime.utcnow().isoformat()
        },
        {
            "iteration": 2,
            "profit": 773616415,
            "coverage": 59.5,
            "cost": 146921209,
            "services": 465,
            "convergence_score": 0.987,
            "needs_rerun": False,
            "rerun_reason": None,
            "timestamp": datetime.utcnow().isoformat()
        }
    ]

    return {
        "iterations": iterations,
        "current_iteration": pipeline_state["current_iteration"],
        "total_iterations": pipeline_state["total_iterations"]
    }

@router.get("/stages")
async def get_pipeline_stages():
    """Get pipeline stage information"""
    return {
        "stages": pipeline_state["stages"],
        "current_stage": pipeline_state["current_stage"]
    }

@router.get("/conflicts")
async def get_conflicts():
    """Get conflict resolution information"""
    # Mock conflict data
    return {
        "conflicts": [
            {
                "id": "conflict_001",
                "type": "vessel_capacity",
                "regions": ["Asia", "Europe"],
                "description": "Vessel capacity exceeded on Asia-Europe route",
                "status": "resolved",
                "resolution": "Reallocated 3 vessels from Asia-Europe to Asia-Americas",
                "timestamp": datetime.utcnow().isoformat()
            },
            {
                "id": "conflict_002",
                "type": "port_congestion",
                "regions": ["Americas"],
                "description": "Port congestion at hub 234",
                "status": "resolved",
                "resolution": "Diverted 20% traffic to alternate hub 456",
                "timestamp": datetime.utcnow().isoformat()
            }
        ],
        "total_conflicts": 2,
        "resolved_conflicts": 2
    }

@router.get("/audit-log")
async def get_audit_log():
    """Get pipeline execution audit log"""
    # Mock audit log
    return {
        "entries": [
            {
                "timestamp": datetime.utcnow().isoformat(),
                "event": "pipeline_started",
                "details": {"iteration": 0, "config": {"max_iterations": 3}}
            },
            {
                "timestamp": datetime.utcnow().isoformat(),
                "event": "stage_completed",
                "details": {"stage": "analysis", "duration": 1.2}
            },
            {
                "timestamp": datetime.utcnow().isoformat(),
                "event": "region_completed",
                "details": {"region": "Asia", "services": 99, "profit": 106904049}
            }
        ]
    }

async def run_pipeline_background(config: PipelineConfig):
    """Run pipeline in background task"""
    try:
        # Update stages
        for stage in pipeline_state["stages"]:
            stage["status"] = "pending"

        # Simulate pipeline execution
        import asyncio

        for i, stage in enumerate(pipeline_state["stages"]):
            pipeline_state["current_stage"] = stage["id"]
            stage["status"] = "running"
            await asyncio.sleep(2)  # Simulate work
            stage["status"] = "completed"

        # Complete pipeline
        pipeline_state.update({
            "status": "completed",
            "end_time": datetime.utcnow().isoformat()
        })

    except Exception as e:
        pipeline_state.update({
            "status": "error",
            "error": str(e),
            "end_time": datetime.utcnow().isoformat()
        })