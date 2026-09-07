import { afterEach, describe, expect, it, vi } from 'vitest'
import { cityCatalogService } from './cityCatalogClient'
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('cityCatalogService failures', () => {
  it('сохраняет structured DataFailure из worker response', async () => {
    class WorkerStub {
      static instance: WorkerStub | undefined

      private listeners = new Map<string, (event: MessageEvent) => void>()

      constructor() {
        WorkerStub.instance = this
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        this.listeners.set(type, listener)
      }

      postMessage(request: { id: number }) {
        this.listeners.get('message')?.({
          data: {
            id: request.id,
            ok: false,
            error: { kind: 'data', reason: 'offline' },
          },
        } as MessageEvent)
      }

      terminate() {}

      failTransport() {
        this.listeners.get('error')?.({} as MessageEvent)
      }
    }
    vi.stubGlobal('Worker', WorkerStub)

    await expect(cityCatalogService.load()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'offline' },
    })
    const worker = WorkerStub.instance
    if (!worker) throw new Error('Не создан тестовый worker')
    worker.failTransport()
  })

  it('возвращает unavailable, если worker transport не создаётся', async () => {
    function UnavailableWorker() {
      throw new Error('worker unavailable')
    }
    vi.stubGlobal('Worker', UnavailableWorker)

    await expect(cityCatalogService.load()).resolves.toEqual({
      ok: false,
      error: { kind: 'data', reason: 'unavailable' },
    })
  })
})

it('завершает ожидающие операции после ошибки Worker и создаёт новый Worker при повторе',async()=>{
  class TestWorker {
    static instances: TestWorker[] = []
    listeners = new Map<string,(event:MessageEvent)=>void>()
    requests: {id:number}[] = []
    terminate = vi.fn()
    constructor() { TestWorker.instances.push(this) }
    addEventListener(type:string,listener:(event:MessageEvent)=>void) {this.listeners.set(type,listener)}
    postMessage(request:{id:number}) {this.requests.push(request)}
    reply(value:unknown) {this.listeners.get('message')?.({data:{id:this.requests[0]?.id,ok:true,result:value}} as MessageEvent)}
    error() {this.listeners.get('error')?.({} as MessageEvent)}
  }
  vi.stubGlobal('Worker',TestWorker)
  const first = cityCatalogService.load()
  const old = TestWorker.instances[0]
  if (!old) throw new Error('Worker не создан')
  old.error()
  expect(await first).toMatchObject({ok:false})
  const retry = cityCatalogService.load()
  const next = TestWorker.instances[1]
  if (!next) throw new Error('Повторный Worker не создан')
  old.error()
  next.reply({countryGroups:[]})
  expect(await retry).toMatchObject({ok:true})
  expect(old.terminate).toHaveBeenCalledOnce()
  expect(next.terminate).not.toHaveBeenCalled()
  next.error()
})
