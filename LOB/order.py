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
        self.executed_trades = {}
        
    def add_order(self, order: Order):
        if order.side == 'buy':
            self.buy.append(order)
        else:
            self.sell.append(order)
        
        # first we sort the two lists of sellers and buyers in such a way that the seller list is sorted
        # in such a way that the lowest price is at the end of the list and the buyer list is sorted in 
        # such a way that the highest price is at the end of the list. This way we can easily match 
        # orders by comparing the last elements of both lists.
        
        self.sell.sort(key=lambda x: (x.price, x.time), reverse=True)
        self.buy.sort(key=lambda x: (x.price, -x.time))
        
        while self.buy and self.sell and self.buy[-1].price >= self.sell[-1].price:
            best_buyer = self.buy[-1]
            best_seller = self.sell[-1]
            
            trade_size = min(best_buyer.size, best_seller.size)
            
            print(f"TRADE EXECUTED: {trade_size} shares at ${best_seller.price} (Buyer: {best_buyer.order_id}, Seller: {best_seller.order_id})")
            
            trade_record = {
                "buyer_id": best_buyer.order_id,
                "seller_id": best_seller.order_id,
                "price": best_seller.price,
                "size": trade_size
            }
            
            # Save the trade in the dictionary under its specific ticker
            ticker = best_buyer.ticker
            if ticker not in self.executed_trades:
                self.executed_trades[ticker] = []
            self.executed_trades[ticker].append(trade_record)
            
            best_buyer.size -= trade_size
            best_seller.size -= trade_size
            
            if best_buyer.size == 0:
                self.buy.pop()
                
            if best_seller.size == 0:
                self.sell.pop()

    def cancel_order(self, order_id: str):
        for order_list in [self.buy, self.sell]:
            for i, order in enumerate(order_list):
                if order.order_id == order_id:
                    print(f"Order {order_id} cancelled.")
                    del order_list[i]
                    return True
        print(f"Order {order_id} not found for cancellation.")
        return False
    