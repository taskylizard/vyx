export const Fragment = Symbol('ComponentsJsx.Fragment')

type FunctionComponent = (props: any) => any

export function createElement(
  type: 'br' | typeof Fragment | FunctionComponent,
  props: any,
  ...children: any[]
) {
  switch (type) {
    case 'br':
      return '\n'
    case Fragment:
      return children
  }

  props ??= {}
  props.children = children
  return type(props)
}

export function jsx(type: any, props: any) {
  const { children, ...rest } = props || {}
  if (children !== undefined) {
    return createElement(type, rest, children)
  }
  return createElement(type, rest)
}
export const jsxs = jsx
export const jsxDEV = jsx
export const h = createElement
