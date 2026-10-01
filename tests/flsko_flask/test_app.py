from flsko_flask.app import create_app


def test_health():
    client = create_app().test_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["disk_policy"].startswith("no local")


def test_missing_video_provider_is_explicit():
    client = create_app().test_client()
    response = client.post("/api/video/generate", json={"prompt": "test", "provider": "allegro"})
    assert response.status_code == 503
    assert "not configured" in response.get_json()["error"]


def test_missing_chat_gateway_is_explicit():
    client = create_app().test_client()
    response = client.post("/api/chat", json={"message": "مرحبا"})
    assert response.status_code == 503
    assert "not configured" in response.get_json()["error"]
