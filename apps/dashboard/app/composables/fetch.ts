import type {
  AvailableRouterMethod as _AvailableRouterMethod,
  NitroFetchRequest
} from 'nitropack'
import type { AsyncData, FetchResult, UseFetchOptions } from 'nuxt/app'
import type { FetchError } from 'ofetch'
import { toast } from 'vue-sonner'

// Custom options
interface UseFetchyOptions<
  _ResT,
  DataT,
  PickKeys extends KeysOf<DataT>,
  DefaultT,
  ReqT extends NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT>
> extends UseFetchOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method> {
  alert?: boolean
  suppress?: boolean
}

type PickFrom<T, K extends Array<string>> = T extends Array<any> ? T
  : T extends Record<string, any> ? keyof T extends K[number] ? T
    : K[number] extends never ? T
    : Pick<T, K[number]>
  : T

type KeysOf<T> = Array<
  T extends T ? (keyof T extends string ? keyof T : never) : never
>

type AvailableRouterMethod<R extends NitroFetchRequest> =
  | _AvailableRouterMethod<R>
  | Uppercase<_AvailableRouterMethod<R>>

export async function useFetchy<
  ResT = void,
  ErrorT = FetchError,
  ReqT extends NitroFetchRequest = NitroFetchRequest,
  Method extends AvailableRouterMethod<ReqT> = ResT extends void
    ? 'get' extends AvailableRouterMethod<ReqT> ? 'get'
    : AvailableRouterMethod<ReqT>
    : AvailableRouterMethod<ReqT>,
  _ResT = ResT extends void ? FetchResult<ReqT, Method> : ResT,
  DataT = _ResT,
  PickKeys extends KeysOf<DataT> = KeysOf<DataT>,
  DefaultT = DataT
>(
  request: Ref<ReqT> | ReqT | (() => ReqT),
  opts: UseFetchyOptions<_ResT, DataT, PickKeys, DefaultT, ReqT, Method> = {}
): Promise<
  AsyncData<PickFrom<DataT, PickKeys> | DefaultT, ErrorT | undefined>
> {
  opts.alert = opts.alert ?? true
  opts.suppress = opts.suppress ?? true

  let successMessage = ''
  let errorMessage = ''

  const result = await useFetch<
    ResT,
    ErrorT,
    ReqT,
    Method,
    _ResT,
    DataT,
    PickKeys,
    DefaultT
  >(request, {
    ...opts,
    onResponse({ response }) {
      if (response.ok) {
        successMessage = response._data?.message
      } else {
        errorMessage = response._data?.message || response.statusText
      }
    }
  })

  if (opts.alert && errorMessage) {
    toast('Something went wrong', {
      description: errorMessage
    })
  }

  if (opts.alert && successMessage) {
    toast.success('Success', {
      description: successMessage
    })
  }

  if (!opts.suppress && result.error.value) {
    throw result.error.value
  }

  return result
}
