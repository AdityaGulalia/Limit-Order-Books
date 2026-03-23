from order import Order, OrderBook

if __name__ == "__main__":
    book = OrderBook()
    
    with open('/Users/adityagulalia/Desktop/Limit-Order-Books/Data/order.csv', 'r') as f:
        for line in f:
            row_data = line.strip().split(',')
            
            price = float(row_data[0])
            size = int(row_data[1])
            time = int(row_data[2])
            side = row_data[3]
            order_id = row_data[4]
            
            order = Order(price, size, time, side, order_id)
            book.add_order(order)
            
    print("\n--- Final Book State ---")
    print(f"Sellers Left: {book.sell}")
    print(f"Buyers Left: {book.buy}")