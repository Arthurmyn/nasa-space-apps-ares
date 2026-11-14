from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env", extra="ignore", protected_namespaces=("settings_",)
    )

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"
    model_path: Path = ROOT_DIR / "ml" / "models" / "model.pkl"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
