export class EventBus {
  constructor(){
    this._handlers = new Map();   // type -> [{fn, prio}]
    this._actions  = new Map();   // name -> fn
    this._q = new Map(); this._flushing = false;
  }
  on(type, fn, prio=0){
    const arr = this._handlers.get(type) ?? [];
    arr.push({fn, prio}); arr.sort((a,b)=> b.prio - a.prio);
    this._handlers.set(type, arr);
    return ()=> this.off(type, fn);
  }
  off(type, fn){
    const arr = this._handlers.get(type) ?? [];
    const i = arr.findIndex(h=>h.fn===fn); if(i>=0) arr.splice(i,1);
  }
  _flush(){
    this._flushing = false;
    const entries = Array.from(this._q.entries());
    this._q.clear();
    for(const [type, payload] of entries){
      const arr = this._handlers.get(type) ?? [];
      for(const {fn} of arr){ const r = fn(payload); if(r && r.consumed) break; }
    }
  }
  emit(type, payload){
    this._q.set(type, payload);
    if(!this._flushing){
      this._flushing = true;
      Promise.resolve().then(()=> this._flush());
    }
    return true;
  }
  registerAction(name, fn){
    if(this._actions.has(name)) throw new Error(`Action '${name}' đã đăng ký`);
    this._actions.set(name, fn);
  }
  act(name, payload){
    const fn = this._actions.get(name);
    if(!fn) throw new Error(`Action '${name}' không tồn tại`);
    return fn(payload);
  }
}
export const eventBus = new EventBus();
