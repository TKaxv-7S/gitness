/* eslint-disable @typescript-eslint/no-explicit-any */
declare const __DEV__: boolean
declare const __ON_PREM__: booelan

declare module '*.png' {
  const value: string
  export default value
}

declare module '*.jpg' {
  const value: string
  export default value
}

declare module '*.svg' {
  const value: string
  export default value
}

declare module '*.gif' {
  const value: string
  export default value
}

declare module '*.mp4' {
  const value: string
  export default value
}

declare module '*.yaml' {
  const value: Record<string, any>
  export default value
}

declare module '*.yml' {
  const value: Record<string, any>
  export default value
}

declare module '*.gql' {
  const query: string
  export default query
}

declare interface Window {
  apiUrl: string
  bugsnagClient?: any
  STRIP_SCM_PREFIX?: boolean
}

declare const monaco: any

declare module '*.scss'

type RequireField<T, K extends keyof T> = T & Required<Pick<T, K>>

declare module 'lang-map' {
  const languages: { languages: (name: string) => string[] }
  export default languages
}

declare module 'react-join' {
  const ReactJoin: React.FC<{ separator: JSX.Element }>
  export default ReactJoin
}

declare type Nullable<T> = T | undefined | null
