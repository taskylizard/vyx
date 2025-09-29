import { auth } from '~~/server/utils/auth'

export default eventHandler((event) => auth.handler(toWebRequest(event)))
