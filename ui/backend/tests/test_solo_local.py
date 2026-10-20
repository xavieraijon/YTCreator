"""La API solo atiende a este equipo: Host local y, en lo que cambia algo, Origin local (CSRF y DNS rebinding)."""


def test_host_ajeno_rechazado(cliente):
    assert cliente.get("/api/salud", headers={"host": "atacante.example:8765"}).status_code == 400
    assert cliente.get("/api/salud", headers={"host": "127.0.0.1:8765"}).status_code == 200
    assert cliente.get("/api/salud", headers={"host": "localhost:4300"}).status_code == 200
    assert cliente.get("/api/salud", headers={"host": "[::1]:8765"}).status_code == 200


def test_origen_ajeno_no_puede_cambiar_nada(cliente):
    r = cliente.post("/api/tareas/999999/cancelar", headers={"origin": "https://atacante.example"})
    assert r.status_code == 403
    r = cliente.post("/api/tareas/999999/cancelar", headers={"origin": "null"})
    assert r.status_code == 403
    # desde la propia UI (o sin Origin, como curl o las herramientas) pasa al router: 404 porque no existe
    assert cliente.post("/api/tareas/999999/cancelar", headers={"origin": "http://127.0.0.1:8765"}).status_code == 404
    assert cliente.post("/api/tareas/999999/cancelar").status_code == 404
    # leer con un Origin ajeno no cambia nada (y el navegador no le deja ver la respuesta: sin CORS)
    assert cliente.get("/api/salud", headers={"origin": "https://atacante.example"}).status_code == 200
