from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPO_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")

    database_url: str
    redis_url: str

    copernicus_client_id: str = ""
    copernicus_client_secret: str = ""
    copernicus_token_url: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    copernicus_catalog_url: str = "https://catalogue.dataspace.copernicus.eu/stac"
    copernicus_process_url: str = "https://sh.dataspace.copernicus.eu/api/v1/process"

    data_dir: str = "/data"
    raw_dir: str = "/data/raw"
    processed_dir: str = "/data/processed"
    tile_dir: str = "/data/tiles"
    index_dir: str = "/data/indexes"
    remote_clip_weights_path: str = "/data/models/remote_clip_vit_b_32.pt"

    offline_mode: bool = False
    environment: str = "development"
    log_level: str = "INFO"


settings = Settings()
