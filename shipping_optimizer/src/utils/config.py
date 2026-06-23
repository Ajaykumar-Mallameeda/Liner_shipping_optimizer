import os
from pathlib import Path
from dotenv import load_dotenv


class Config:
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    load_dotenv(PROJECT_ROOT / ".env")
    DATA_DIR = PROJECT_ROOT / "data"
    LOGS_DIR = PROJECT_ROOT/ "logs"
    
    OPENCODE_API_KEY = os.getenv("OPENCODE_API_KEY")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    # Primary LLM API key (OpenCode first, fallback to OpenRouter)
    LLM_API_KEY = OPENCODE_API_KEY or OPENROUTER_API_KEY
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://opencode.ai/zen/v1")
    ORCHESTRATOR_MODEL = os.getenv("ORCHESTRATOR_MODEL", "opencode/deepseek-v4-flash-free")
    REGIONAL_MODEL = os.getenv("REGIONAL_MODEL", "opencode/deepseek-v4-flash-free")
    
    GA_POPULATION_SIZE = int(os.getenv("GA_POPULATION_SIZE", "80"))
    GA_GENERATIONS = int(os.getenv("GA_GENERATIONS", "120"))
    MILP_TIME_LIMIT = int(os.getenv("MILP_TIME_LIMIT", "120"))
    
    @classmethod
    def validate(cls):

        if not cls.LLM_API_KEY:
            raise ValueError(
                "No LLM API key found!\n"
                "Set OPENCODE_API_KEY in your .env file"
            )

        cls.DATA_DIR.mkdir(exist_ok=True)
        cls.LOGS_DIR.mkdir(exist_ok=True)

        print("+ Configuration validated")
Config.validate()
        