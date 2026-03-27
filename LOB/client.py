import requests

# Make sure this matches the port your server is running on!
BASE_URL = "http://127.0.0.1:8000"

order_data = {
    "price": 150.0,
    "size": 100,
    "time": 1,
    "side": "buy",
    "order_id": "client_order_1"
}

print(f"Sending order to {BASE_URL}/Submit_order...")
response = requests.post(f"{BASE_URL}/Submit_order", json=order_data)

print(f"Status Code: {response.status_code}")
print(f"Response: {response.json()}")