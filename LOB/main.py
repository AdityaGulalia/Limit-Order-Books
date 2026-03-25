from order import Order, OrderBook

if __name__ == "__main__":
    book = OrderBook()
    
    with open('/Users/adityagulalia/Desktop/Limit-Order-Books/Data/order.csv', 'r') as f:
        for line in f:
            row_data = line.strip().split(',')
            
            ticker = row_data[0]
            price = float(row_data[1])
            size = int(row_data[2])
            time = int(row_data[3])
            side = row_data[4]
            order_id = row_data[5]
            
            order = Order(ticker,price, size, time, side, order_id)
            book.add_order(order)
            
    print("\n--- Final Book State ---")
    print(f"Sellers Left: {book.sell}")
    print(f"Buyers Left: {book.buy}")