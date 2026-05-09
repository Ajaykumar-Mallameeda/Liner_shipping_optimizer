"""
API routes for metrics and KPI data
"""

from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from datetime import datetime

router = APIRouter(prefix="/metrics", tags=["metrics"])

# In-memory storage for current metrics (in production, use database)
current_metrics = {
    "weekly_profit": 773616415,
    "annual_profit": 40228053557,
    "total_cost": 146921209,
    "total_services": 465,
    "coverage_percentage": 59.5,
    "profit_margin": 81.0,
    "vessels_utilized": 372,
    "total_teu_moved": 1934041
}

@router.get("/summary")
async def get_summary_metrics():
    """Get summary KPI metrics"""
    return {
        "metrics": current_metrics,
        "last_updated": datetime.utcnow().isoformat(),
        "status": "success"
    }

@router.get("/profit-trends")
async def get_profit_trends():
    """Get historical profit trends"""
    # Mock data - in production, fetch from database
    return {
        "data": [
            {"week": "2024-W01", "profit": 650000000, "cost": 120000000},
            {"week": "2024-W02", "profit": 680000000, "cost": 125000000},
            {"week": "2024-W03", "profit": 710000000, "cost": 130000000},
            {"week": "2024-W04", "profit": 730000000, "cost": 135000000},
            {"week": "2024-W05", "profit": 773616415, "cost": 146921209}
        ],
        "trend": "increasing"
    }

@router.get("/coverage-metrics")
async def get_coverage_metrics():
    """Get detailed coverage metrics by region"""
    return {
        "regions": [
            {"region": "Asia", "coverage": 76.9, "uncovered_teu": 24978},
            {"region": "Europe", "coverage": 82.3, "uncovered_teu": 18765},
            {"region": "Americas", "coverage": 68.5, "uncovered_teu": 35421},
            {"region": "Africa", "coverage": 45.2, "uncovered_teu": 52134},
            {"region": "Oceania", "coverage": 58.9, "uncovered_teu": 28976}
        ],
        "global_coverage": 59.5
    }

@router.get("/service-stats")
async def get_service_statistics():
    """Get service deployment statistics"""
    return {
        "total_services": 465,
        "active_services": 465,
        "services_by_region": {
            "Asia": 123,
            "Europe": 98,
            "Americas": 112,
            "Africa": 67,
            "Oceania": 65
        },
        "services_by_type": {
            "Feeder": 156,
            "Regional": 189,
            "Mainline": 120
        },
        "vessel_utilization": {
            "utilized": 372,
            "available": 450,
            "utilization_rate": 82.7
        }
    }

@router.put("/update")
async def update_metrics(metrics: Dict[str, Any]):
    """Update metrics (internal use)"""
    global current_metrics
    current_metrics.update(metrics)
    return {
        "status": "updated",
        "timestamp": datetime.utcnow().isoformat()
    }