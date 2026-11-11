import time

import requests
import os

API_URL = "https://season3.kubabin.dev/chat"

while True:
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

    os.system('cls' if os.name == 'nt' else 'clear')

    for msg in get_messages(data):
        player = msg.get("player") or msg.get("user") or "unknown"
        content = msg.get("content") or msg.get("message") or ""
        print(f"<{player}> {content}")
    
    time.sleep(5)
