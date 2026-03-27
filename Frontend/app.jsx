const { useState, useEffect, useRef, useMemo, useCallback } = React;

function App() {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:8000');
  const [markets, setMarkets] = useState({});
  const [selectedTicker, setSelectedTicker] = useState('');
  const [selectedSide, setSelectedSide] = useState('buy');
  const [openOrders, setOpenOrders] = useState({ buys: [], sells: [] });
  const [trades, setTrades] = useState([]);
  const [activeTab, setActiveTab] = useState('order');
  const [newTicker, setNewTicker] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderSize, setOrderSize] = useState('');
  const [orderId, setOrderId] = useState('');
  const [tradesTicker, setTradesTicker] = useState('');
  const [lastTradeIds, setLastTradeIds] = useState(new Set());
  const [toasts, setToasts] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [topbarTime, setTopbarTime] = useState('--:--:--');

  const canvasRef = useRef(null);

  // Time effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTopbarTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3100);
  }, []);

  const api = useCallback(async (method, path, body) => {
    try {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(baseUrl + path, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  }, [baseUrl]);

  const fetchLivePrices = useCallback(async () => {
    const data = await api('GET', '/Live_prices');
    if (data.error) return;

    const prices = data['Live Market Prices'] || {};
    setMarkets(prev => {
      const next = { ...prev };
      Object.entries(prices).forEach(([ticker, info]) => {
        if (!next[ticker]) next[ticker] = { name: ticker };
        const raw = info['Current Price'];
        const price = parseFloat(raw.replace('$', ''));
        next[ticker].lastPrice = price;
      });
      return next;
    });
  }, [api]);

  const refreshBookState = useCallback(async (ticker) => {
    if (!ticker) return;
    const data = await api('GET', `/Book_state/${ticker}`);
    if (data.error) return;

    const sellers = (data['Sellers Left'] || []).sort((a,b) => b.price - a.price);
    const buyers  = (data['Buyers Left']  || []).sort((a,b) => b.price - a.price);

    setOpenOrders({ buys: buyers, sells: sellers });
  }, [api]);

  const fetchTrades = useCallback(async (ticker) => {
    if (!ticker) return;
    const data = await api('GET', `/Executed_trades/${ticker}`);
    const executedTrades = data['Executed Trades'] || [];
    
    setLastTradeIds(prev => {
      const next = new Set(prev);
      executedTrades.forEach(t => next.add(t.id));
      return next;
    });
    setTrades(executedTrades);
  }, [api]);

  const fullRefresh = useCallback(async () => {
    setSpinning(true);
    await fetchLivePrices();
    if (selectedTicker) {
      await refreshBookState(selectedTicker);
      await fetchTrades(selectedTicker);
    }
    setTimeout(() => setSpinning(false), 800);
  }, [fetchLivePrices, selectedTicker, refreshBookState, fetchTrades]);

  // Initial loads and Auto Refresh
  useEffect(() => {
    fullRefresh();
    const interval = setInterval(() => {
      fetchLivePrices();
      if (selectedTicker) {
        refreshBookState(selectedTicker);
        if (activeTab === 'trades') {
          fetchTrades(tradesTicker || selectedTicker);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fullRefresh, selectedTicker, activeTab, tradesTicker, fetchLivePrices, refreshBookState, fetchTrades]);


  const handleListCompany = async () => {
    const t = newTicker.trim().toUpperCase();
    const n = newCompanyName.trim();
    if (!t || !n) { toast('Fill in ticker and company name', 'error'); return; }

    const data = await api('POST', '/list_company', { ticker: t, company_name: n });
    if (data.error) { toast(data.error, 'error'); return; }

    setMarkets(prev => ({ ...prev, [t]: { name: n, lastPrice: null } }));
    setNewTicker('');
    setNewCompanyName('');
    toast(`${t} listed successfully!`, 'success');
    handleSelectTicker(t);
  };

  const handleSelectTicker = (ticker) => {
    setSelectedTicker(ticker);
    setTradesTicker(ticker);
    refreshBookState(ticker);
    fetchTrades(ticker);
  };

  const generateId = () => {
    return 'ORD-' + Math.random().toString(36).slice(2,8).toUpperCase();
  };

  const handleSubmitOrder = async () => {
    if (!selectedTicker) { toast('Select a market first', 'error'); return; }
    const p = parseFloat(orderPrice);
    const s = parseInt(orderSize);
    const oId = orderId.trim() || generateId();

    if (!p || p <= 0) { toast('Enter a valid price', 'error'); return; }
    if (!s || s <= 0)   { toast('Enter a valid size', 'error'); return; }

    setSubmitting(true);
    const data = await api('POST', '/Submit_order', {
      ticker: selectedTicker, price: p, size: s, side: selectedSide, order_id: oId
    });
    setSubmitting(false);

    if (data.error) { toast(data.error, 'error'); return; }

    toast(data.message || 'Order submitted!', 'success');
    setOrderId('');
    await refreshBookState(selectedTicker);
    await fetchLivePrices();
  };

  const cancelOrder = async (orderIdToCancel) => {
    const data = await api('POST', `/Cancel_order/${selectedTicker}/${orderIdToCancel}`);
    if (data.error) { toast(data.error, 'error'); return; }
    toast(data.message, data.message?.includes('Not Found') ? 'error' : 'success');
    await refreshBookState(selectedTicker);
  };

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const depthCtx = canvas.getContext('2d');
    const buyers = openOrders.buys;
    const sellers = openOrders.sells;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width - 24;
    const H = 110;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    depthCtx.scale(dpr, dpr);
    depthCtx.clearRect(0, 0, W, H);

    if (!buyers.length && !sellers.length) {
      depthCtx.fillStyle = '#3d4166';
      depthCtx.font = '10px JetBrains Mono';
      depthCtx.textAlign = 'center';
      depthCtx.fillText('Select a market to view depth', W/2, H/2);
      return;
    }

    const buyPrices  = [...buyers].sort((a,b) => a.price - b.price);
    const sellPrices = [...sellers].sort((a,b) => a.price - b.price);

    const buildCumulative = (orders) => {
      let cum = 0;
      return orders.map(o => { cum += o.size; return { price: o.price, size: cum }; });
    };

    const cumBuy  = buildCumulative(buyPrices);
    const cumSell = buildCumulative(sellPrices);

    if (!cumBuy.length && !cumSell.length) return;

    const allPrices = [...cumBuy, ...cumSell].map(o=>o.price);
    const allSizes  = [...cumBuy, ...cumSell].map(o=>o.size);
    const minP = Math.min(...allPrices) * 0.998;
    const maxP = Math.max(...allPrices) * 1.002;
    const maxS = Math.max(...allSizes) * 1.15;

    const px = p => ((p - minP) / (maxP - minP)) * W;
    const py = s => H - (s / maxS) * (H - 10);

    const drawStep = (points, color, fillColor) => {
      if (!points.length) return;
      depthCtx.beginPath();
      depthCtx.moveTo(px(points[0].price), H);
      points.forEach(pt => { depthCtx.lineTo(px(pt.price), py(pt.size)); });
      depthCtx.lineTo(px(points[points.length-1].price), H);
      depthCtx.closePath();
      depthCtx.fillStyle = fillColor;
      depthCtx.fill();
      depthCtx.beginPath();
      depthCtx.moveTo(px(points[0].price), py(points[0].size));
      points.forEach(pt => depthCtx.lineTo(px(pt.price), py(pt.size)));
      depthCtx.strokeStyle = color;
      depthCtx.lineWidth = 1.5;
      depthCtx.stroke();
    };

    drawStep(cumBuy,  '#00e676', 'rgba(0,230,118,0.12)');
    drawStep(cumSell, '#ff4757', 'rgba(255,71,87,0.12)');

    // Midpoint line
    if (cumBuy.length && cumSell.length) {
      const mid = (cumBuy[cumBuy.length-1].price + cumSell[0].price) / 2;
      const x = px(mid);
      depthCtx.beginPath();
      depthCtx.setLineDash([3, 3]);
      depthCtx.moveTo(x, 0); depthCtx.lineTo(x, H);
      depthCtx.strokeStyle = 'rgba(255,193,7,0.35)';
      depthCtx.lineWidth = 1;
      depthCtx.stroke();
      depthCtx.setLineDash([]);
      depthCtx.fillStyle = '#ffc107';
      depthCtx.font = '9px JetBrains Mono';
      depthCtx.textAlign = 'center';
      depthCtx.fillText(`$${mid.toFixed(2)}`, x, 10);
    }

    depthCtx.fillStyle = '#3d4166';
    depthCtx.font = '8px JetBrains Mono';
    depthCtx.textAlign = 'left';
    depthCtx.fillText(`$${minP.toFixed(2)}`, 2, H-2);
    depthCtx.textAlign = 'right';
    depthCtx.fillText(`$${maxP.toFixed(2)}`, W-2, H-2);

  }, [openOrders, selectedTicker]);

  // Derived state
  const marketKeys = Object.keys(markets);
  const maxSize = openOrders ? Math.max(1, ...openOrders.sells.map(o=>o.size), ...openOrders.buys.map(o=>o.size)) : 1;
  const bestAsk = openOrders?.sells?.length ? openOrders.sells[openOrders.sells.length - 1].price : null;
  const bestBid = openOrders?.buys?.length ? openOrders.buys[0].price : null;
  const spread = bestAsk && bestBid ? (bestAsk - bestBid).toFixed(2) : '—';
  const mid = bestAsk && bestBid ? ((bestAsk + bestBid) / 2).toFixed(2) : '—';
  const lastPrice = selectedTicker && markets[selectedTicker]?.lastPrice ? markets[selectedTicker].lastPrice.toFixed(2) : '—';
  const allOpenOrders = [...(openOrders.sells || []).map(o=>({...o, side:'sell'})), ...(openOrders.buys || []).map(o=>({...o, side:'buy'}))];

  return (
    <>
      <div className="topbar">
        <div className="logo">
          <div className="logo-icon">📊</div>
          <div>
            <div>LOB TERMINAL</div>
            <div className="logo-sub">Limit Order Book</div>
          </div>
        </div>
        <div className="topbar-sep"></div>
        <div className="status-dot"></div>
        <div className="ticker-strip" id="tickerStrip">
          {marketKeys.length === 0 ? (
            <span style={{color:'var(--text-muted)',fontSize:'10px',alignSelf:'center'}}>No markets listed yet</span>
          ) : (
            marketKeys.map(t => (
              <div key={t} className={`ticker-item ${selectedTicker === t ? 'active' : ''}`} onClick={() => handleSelectTicker(t)}>
                <span className="ticker-sym">{t}</span>
                <span className="ticker-price">${markets[t].lastPrice ? markets[t].lastPrice.toFixed(2) : '—'}</span>
              </div>
            ))
          )}
        </div>
        <div className="topbar-sep"></div>
        <div className="topbar-time">{topbarTime}</div>
      </div>

      <div className="base-url-bar">
        <span className="base-url-label">Server</span>
        <input 
          className="base-url-input" 
          value={baseUrl} 
          onChange={e => setBaseUrl(e.target.value.replace(/\/$/, ''))} 
          placeholder="http://127.0.0.1:8000" 
        />
        <button className={`refresh-btn ${spinning ? 'spinning' : ''}`} onClick={fullRefresh}>↻ Refresh</button>
      </div>

      <div className="workspace">
        <div className="panel-left">
          <div className="section" style={{flex:1, minHeight:'120px'}}>
            <div className="section-header">
              <span className="section-title">Markets</span>
              <span className="section-badge">{marketKeys.length}</span>
              <span className="section-action" onClick={fullRefresh}>↻ Sync</span>
            </div>
            <div className="markets-list">
              {marketKeys.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">🏛</div>
                  <div className="msg">List a company to create a market</div>
                </div>
              ) : (
                marketKeys.map(t => (
                  <div key={t} className={`market-row ${selectedTicker === t ? 'selected' : ''}`} onClick={() => handleSelectTicker(t)}>
                    <div className="market-sym">{t}</div>
                    <div className="market-name">{markets[t].name || t}</div>
                    <div className="market-price">{markets[t].lastPrice ? `$${markets[t].lastPrice.toFixed(2)}` : '—'}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="section" style={{flex:'0 0 auto'}}>
            <div className="section-header">
              <span className="section-title">List Company</span>
            </div>
            <div className="list-form">
              <div className="form-row">
                <div className="field-group">
                  <label className="field-label">Ticker</label>
                  <input className="field-input" placeholder="AAPL" maxLength="10" style={{textTransform:'uppercase'}} value={newTicker} onChange={e=>setNewTicker(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Company Name</label>
                  <input className="field-input" placeholder="Apple Inc." value={newCompanyName} onChange={e=>setNewCompanyName(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-accent" onClick={handleListCompany}>+ List Market</button>
            </div>
          </div>

          <div className="section" style={{flex:1, minHeight:'100px'}}>
            <div className="section-header">
              <span className="section-title">Open Orders</span>
              <span className="section-badge">{allOpenOrders.length}</span>
              <span className="section-action" onClick={() => refreshBookState(selectedTicker)}>↻</span>
            </div>
            <div className="open-orders-area">
              {allOpenOrders.length === 0 ? (
                <div className="empty-state" style={{padding:'16px'}}>
                  <div className="icon">📭</div>
                  <div className="msg">No open orders</div>
                </div>
              ) : (
                allOpenOrders.map(o => (
                  <div key={o.id} className="open-order-item">
                    <div className={`open-order-side ${o.side}`}>{o.side.toUpperCase()}</div>
                    <div className="open-order-info">
                      <div className="open-order-id">{o.id}</div>
                      <div className="open-order-detail">{o.size} @ ${o.price.toFixed(2)}</div>
                    </div>
                    <button className="cancel-btn" onClick={() => cancelOrder(o.id)}>✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="panel-center">
          <div className="chart-section">
            <div className="chart-title">▪ DEPTH VISUALIZATION — <span style={{color:'var(--text-secondary)'}}>{selectedTicker || 'SELECT MARKET'}</span></div>
            <canvas ref={canvasRef} height="110"></canvas>
          </div>

          <div className="book-area">
            <div className="depth-header">
              <span>ORDER ID</span>
              <span>SIZE</span>
              <span style={{textAlign:'right'}}>PRICE</span>
            </div>

            <div className="depth-sells">
              {!openOrders.sells.length ? <div className="empty-state"><div className="msg">No sell orders</div></div> : (
                openOrders.sells.map(o => (
                  <div key={o.id} className="depth-row sell">
                    <div className="depth-bar" style={{width:`${(o.size/maxSize*100).toFixed(1)}%`}}></div>
                    <div className="depth-id" style={{position:'relative', zIndex:1}}>{o.id}</div>
                    <div className="depth-size" style={{textAlign:'center', position:'relative', zIndex:1}}>{o.size.toLocaleString()}</div>
                    <div className="depth-price" style={{textAlign:'right', position:'relative', zIndex:1}}>${o.price.toFixed(2)}</div>
                  </div>
                ))
              )}
            </div>

            <div className="spread-row">
              <span className="spread-label">LAST</span>
              <span className="last-price">${lastPrice}</span>
              <span className="spread-label">SPREAD</span>
              <span className="spread-value">${spread}</span>
              <span className="spread-label">MID</span>
              <span className="spread-value">${mid}</span>
            </div>

            <div className="depth-buys">
              {!openOrders.buys.length ? <div className="empty-state"><div className="msg">No buy orders</div></div> : (
                openOrders.buys.map(o => (
                  <div key={o.id} className="depth-row buy">
                    <div className="depth-bar" style={{width:`${(o.size/maxSize*100).toFixed(1)}%`}}></div>
                    <div className="depth-id" style={{position:'relative', zIndex:1}}>{o.id}</div>
                    <div className="depth-size" style={{textAlign:'center', position:'relative', zIndex:1}}>{o.size.toLocaleString()}</div>
                    <div className="depth-price" style={{textAlign:'right', position:'relative', zIndex:1}}>${o.price.toFixed(2)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="panel-right">
          <div className="tab-bar">
            <div className={`tab ${activeTab === 'order' ? 'active' : ''}`} onClick={() => setActiveTab('order')}>Order Entry</div>
            <div className={`tab ${activeTab === 'trades' ? 'active' : ''}`} onClick={() => { setActiveTab('trades'); fetchTrades(tradesTicker || selectedTicker); }}>Trade Tape</div>
          </div>

          <div className={`tab-content ${activeTab === 'order' ? 'active' : ''}`}>
            <div className="order-form">
              <div className="field-group">
                <label className="field-label">Market</label>
                <select className="field-input" value={selectedTicker} onChange={(e) => handleSelectTicker(e.target.value)}>
                  <option value="">— Select Market —</option>
                  {marketKeys.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="side-toggle">
                <div className={`side-btn buy ${selectedSide === 'buy' ? 'active' : ''}`} onClick={() => setSelectedSide('buy')}>▲ BUY</div>
                <div className={`side-btn sell ${selectedSide === 'sell' ? 'active' : ''}`} onClick={() => setSelectedSide('sell')}>▼ SELL</div>
              </div>

              <div className="form-row">
                <div className="field-group">
                  <label className="field-label">Price</label>
                  <input className="field-input" type="number" min="0" step="0.01" placeholder="0.00" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Size</label>
                  <input className="field-input" type="number" min="1" step="1" placeholder="100" value={orderSize} onChange={e=>setOrderSize(e.target.value)} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Order ID</label>
                <input className="field-input" placeholder="Auto-generate" value={orderId} onChange={e=>setOrderId(e.target.value)} />
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'2px'}}>
                <button className="btn btn-ghost" onClick={() => setOrderId(generateId())} style={{fontSize:'9px',padding:'5px 10px'}}>⚡ Generate ID</button>
                <button className="btn btn-ghost" onClick={() => {setOrderPrice(''); setOrderSize(''); setOrderId('');}} style={{fontSize:'9px',padding:'5px 10px'}}>✕ Clear</button>
              </div>

              <button className={`btn ${selectedSide === 'buy' ? 'btn-buy' : 'btn-sell'}`} disabled={submitting} onClick={handleSubmitOrder} style={{marginTop:'4px',width:'100%',padding:'10px'}}>
                {submitting ? 'SUBMITTING...' : `SUBMIT ${selectedSide.toUpperCase()} ORDER`}
              </button>

              {parseFloat(orderPrice) > 0 && parseInt(orderSize) > 0 && (
                <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'5px',padding:'10px 12px',display:'flex',flexDirection:'column',gap:'4px'}}>
                  <div style={{fontSize:'9px',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'4px'}}>Order Preview</div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{color:'var(--text-muted)',fontSize:'10px'}}>Notional</span>
                    <span style={{color:'var(--text-primary)',fontSize:'11px',fontWeight:600}}>${(parseFloat(orderPrice)*parseInt(orderSize)).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{color:'var(--text-muted)',fontSize:'10px'}}>Type</span>
                    <span style={{color:'var(--accent)',fontSize:'10px'}}>LIMIT</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`tab-content ${activeTab === 'trades' ? 'active' : ''}`}>
            <div style={{padding:'8px 10px',background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
              <select className="field-input" value={tradesTicker} onChange={e => { setTradesTicker(e.target.value); fetchTrades(e.target.value); }} style={{flex:1,fontSize:'10px',padding:'4px 8px'}}>
                <option value="">— Select Ticker —</option>
                {marketKeys.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button className="refresh-btn" onClick={() => fetchTrades(tradesTicker || selectedTicker)}>↻</button>
            </div>
            <div className="trades-area">
              <div className="trade-scroll">
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>PRICE</th>
                      <th>SIZE</th>
                      <th>BUYER</th>
                      <th>SELLER</th>
                      <th>TIME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!trades.length ? (
                      <tr><td colSpan="6"><div className="empty-state" style={{padding:'20px'}}><div className="icon">📜</div><div className="msg">No trades executed yet</div></div></td></tr>
                    ) : (
                      trades.map(t => (
                        <tr key={t.id} className={!lastTradeIds.has(t.id) ? 'new-trade' : ''}>
                          <td style={{color:'var(--text-muted)'}}>{t.id}</td>
                          <td className="price">${parseFloat(t.price).toFixed(2)}</td>
                          <td className="size-td">{t.size.toLocaleString()}</td>
                          <td className="buyer">{t.buyer_id}</td>
                          <td className="seller">{t.seller_id}</td>
                          <td style={{color:'var(--text-muted)'}}>{t.timestamp ? new Date(t.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);