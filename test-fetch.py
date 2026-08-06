import requests

API_URL = "https://api.kubabin.dev/chat"


def get_messages(data):
    if isinstance(data, dict):
        if isinstance(data.get("messages"), list):
            return data["messages"]
        if isinstance(data.get("data"), list):
            return data["data"]
    if isinstance(data, list):
        return data
    return []


try:
    response = requests.get(API_URL, timeout=10)
    response.raise_for_status()
    data = response.json()
except requests.RequestException as e:
    print(f"Failed to fetch chat: {e}")
    data = []


for msg in get_messages(data):
    player = msg.get("player") or msg.get("user") or "unknown"
    content = msg.get("content") or msg.get("message") or ""
    print(f"<{player}> {content}")
