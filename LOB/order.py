class Order:
    __slots__ = ['ticker','price', 'size', 'time', 'side', 'order_id']

    def __init__(self, ticker:str, price: float, size: int, time: int, side: str, order_id: str):
        self.ticker = ticker
        self.price = price
        self.size = size
        self.time = time
        self.side = side
        self.order_id = order_id
        
    def __repr__(self) -> str:
        return f"Order({self.side.upper()} {self.size} @ {self.price}, t={self.time}, id='{self.order_id}')"


class OrderBook:
    def __init__(self):
        self.buy = []
        self.sell = []
        # We no longer need self.executed_trades here because MySQL is our history!
        
    def add_order(self, order: Order):
        if order.side == 'buy':
            self.buy.append(order)
        else:
            self.sell.append(order)
        
        self.sell.sort(key=lambda x: (x.price, x.time), reverse=True)
        self.buy.sort(key=lambda x: (x.price, -x.time))
        
        # 1. Create a "basket" to catch any matches that happen right now
        new_matches = []
        
        while self.buy and self.sell and self.buy[-1].price >= self.sell[-1].price:
            best_buyer = self.buy[-1]
            best_seller = self.sell[-1]
            trade_size = min(best_buyer.size, best_seller.size)
            
            # 2. Create the receipt
            trade_record = {
                "buyer_id": best_buyer.order_id,
                "seller_id": best_seller.order_id,
                "price": best_seller.price, # Execution happens at the resting price
                "size": trade_size,
                "ticker": order.ticker
            }
            
            # 3. Toss it in the basket
            new_matches.append(trade_record)
            
            best_buyer.size -= trade_size
            best_seller.size -= trade_size
            
            if best_buyer.size == 0: self.buy.pop()
            if best_seller.size == 0: self.sell.pop()
            
        # 4. Hand the basket back to the server!
        return new_matches