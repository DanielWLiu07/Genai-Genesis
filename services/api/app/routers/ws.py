from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List
import json

router = APIRouter(tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, project_id: str, ws: WebSocket):
        await ws.accept()
        if project_id not in self.connections:
            self.connections[project_id] = []
        self.connections[project_id].append(ws)

    def disconnect(self, project_id: str, ws: WebSocket):
        if project_id in self.connections:
            self.connections[project_id] = [c for c in self.connections[project_id] if c != ws]

    async def broadcast(self, project_id: str, message: dict):
        if project_id in self.connections:
            for ws in self.connections[project_id]:
                try:
                    await ws.send_json(message)
                except:
                    pass

manager = ConnectionManager()

@router.websocket("/ws/{project_id}")
async def websocket_endpoint(ws: WebSocket, project_id: str):
    await manager.connect(project_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            await manager.broadcast(project_id, msg)
    except WebSocketDisconnect:
        manager.disconnect(project_id, ws)
