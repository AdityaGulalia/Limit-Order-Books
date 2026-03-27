from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import time
import os
from dotenv import load_dotenv
import mysql.connector
from order import Order, OrderBook

load_dotenv()

db_connection = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),            
    password=os.getenv("DB_PASS"),            
    database=os.getenv("DB_NAME")  
)
cursor = db_connection.cursor(dictionary=True, buffered=True) 

cursor.execute('''
    CREATE TABLE IF NOT EXISTS trade_tape (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticker VARCHAR(10),
        price FLOAT,
        size INT,
        buyer_id VARCHAR(50),
        seller_id VARCHAR(50),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
''')
db_connection.commit()

app = FastAPI()

# Allow the frontend to communicate with this backend API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (good for local testing)
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, etc.)
    allow_headers=["*"],
)

book = OrderBook()
markets = {}

class OrderRequest(BaseModel):
    ticker: str
    price: float
    size: int
    side: str
    order_id: str

class CompanyListing(BaseModel):
    ticker: str
    company_name: str

@app.get("/")
def root():
    return {"message": "Limit Order Book is live!"}


@app.post("/list_company")
def list_company(listing: CompanyListing):
    if listing.ticker in markets:
        return {"error": f"{listing.ticker} is already listed!"}
    markets[listing.ticker] = OrderBook()
    return {"message": f"Successfully listed {listing.company_name} ({listing.ticker})!"}

@app.post("/Submit_order")
def submit_order(order_data: OrderRequest):
    # (Optional: Check if the ticker exists in your markets dictionary first)
    if order_data.ticker not in markets:
        return {"error": f"Market {order_data.ticker} not found. List the company first."}

    new_order = Order(
        order_data.ticker,
        order_data.price,
        order_data.size,
        time.time(),
        order_data.side,
        order_data.order_id,
    )

    # 1. Ask the engine (the per-ticker book) to match and CATCH the returned list of trades
    trades_to_save = markets[order_data.ticker].add_order(new_order)
    
    # 2. If the engine found matches, send them to the MySQL Vault
    if trades_to_save:
        for trade in trades_to_save:
            cursor.execute('''
                INSERT INTO trade_tape (ticker, price, size, buyer_id, seller_id) 
                VALUES (%s, %s, %s, %s, %s)
            ''', (trade['ticker'], trade['price'], trade['size'], trade['buyer_id'], trade['seller_id']))
        
        # Lock them all in at once
        db_connection.commit()
    
    return {"message": f"Order {new_order.order_id} Processed. {len(trades_to_save) if trades_to_save else 0} matches saved."}
@app.post("/Cancel_order/{ticker}/{order_id}")
def cancel_order(ticker: str, order_id: str):
    if ticker not in markets:
        return {"error": "Market not found!"}
        
    was_cancelled = markets[ticker].cancel_order(order_id)
    if was_cancelled:
        return {"message": f"Order {order_id} Cancelled!"}
    else:
        return {"message": f"Order {order_id} Not Found!"}
    
@app.get("/Book_state/{ticker}")
def get_book_state(ticker: str):
    if ticker not in markets:
        return {"error": "Market not found!"}
        
    target_book = markets[ticker]
    buyers_list = [{"price": o.price, "size": o.size, "id": o.order_id} for o in target_book.buy]
    sellers_list = [{"price": o.price, "size": o.size, "id": o.order_id} for o in target_book.sell]

    return {"Market": ticker, "Sellers Left": sellers_list, "Buyers Left": buyers_list}
    
@app.get("/Executed_trades/{ticker}")
def get_executed_trades(ticker: str):
    
    db_connection.ping(reconnect=True, attempts=3)
    
    cursor.execute("SELECT * FROM trade_tape WHERE ticker = %s ORDER BY timestamp DESC", (ticker,))
    trades = cursor.fetchall()
    
    if not trades:
        return {"message": f"No trades executed for ticker {ticker}."}
    
    return {"Executed Trades": trades}

@app.get("/Live_prices")
def get_live_prices():
    db_connection.ping(reconnect=True, attempts=3)
    
    cursor.execute("SELECT DISTINCT ticker FROM trade_tape")
    all_tickers = cursor.fetchall()
    
    market_overview = {}
    
    for row in all_tickers:
        ticker = row['ticker']
        
        cursor.execute("SELECT price, timestamp FROM trade_tape WHERE ticker = %s ORDER BY timestamp DESC LIMIT 1", (ticker,))
        last_trade = cursor.fetchone()
        
        if last_trade:
            market_overview[ticker] = {
                "Current Price": f"${last_trade['price']}",
                "Last Trade Time": last_trade['timestamp']
            }
            
    return {"Live Market Prices": market_overview}