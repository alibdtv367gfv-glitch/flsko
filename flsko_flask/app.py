from __future__ import annotations

import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from .blueprints.chat_agent_bp import chat_agent_bp
from .blueprints.interactive_bp import interactive_bp
from .blueprints.video_bp import video_bp


def create_app() -> Flask:
    load_dotenv()
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("MAX_REQUEST_BYTES", str(2 * 1024 * 1024)))
    origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "").split(",") if item.strip()]
    CORS(app, origins=origins or "*")
    app.register_blueprint(video_bp)
    app.register_blueprint(chat_agent_bp)
    app.register_blueprint(interactive_bp)

    @app.get("/health")
    def health():
        return jsonify(ok=True, service="flsko-flask-connectors", disk_policy="no local model weights or media files")

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify(error="request too large; send a remote media URL or a small JSON payload"), 413

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host=os.getenv("FLASK_HOST", "0.0.0.0"), port=int(os.getenv("FLASK_PORT", "7860")))
