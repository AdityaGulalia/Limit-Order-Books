from fastapi import FastAPI
from pydantic import BaseModel
from order import Order, OrderBook

app = FastAPI()

book = OrderBook()

class OrderRequest(BaseModel):
    ticker: str
    price: float
    size: int
    time: int
    side: str
    order_id: str

@app.get("/")
def root():
    return {"message": "Limit Order Book is live!"}

@app.post("/Submit_order")
def submit_order(order_data: OrderRequest):
    new_order = Order(order_data.ticker, order_data.price, order_data.size, order_data.time, order_data.side, order_data.order_id)
    book.add_order(new_order)
    return {"message": f"Order {new_order.order_id} Received and Processed!"}

@app.post("/Cancel_order/{order_id}")
def cancel_order(order_id: str):
    was_cancelled = book.cancel_order(order_id)
    if was_cancelled:
        return {"message": f"Order {order_id} Cancelled!"}
    else:
        return {"message": f"Order {order_id} Not Found!"}
    
@app.get("/Book_state")
def get_book_state():
    
    buyers_list = []
    for order in book.buy:
        buyers_list.append({
            "price": order.price, 
            "size": order.size, 
            "id": order.order_id
        })
        
    sellers_list = []
    for order in book.sell:
        sellers_list.append({
            "price": order.price, 
            "size": order.size, 
            "id": order.order_id
        })

    return {"Sellers Left": sellers_list, "Buyers Left": buyers_list}
    
@app.get("/Executed_trades")
def get_executed_trades(ticker: str):
    if ticker not in book.executed_trades:
        return {"message": f"No trades executed for ticker {ticker}."}
    
    return {"Executed Trades": book.executed_trades[ticker]}