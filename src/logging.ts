import { ConsoleTransport, FileTransport, Logger, LogLevel, PrettyFormatter } from 'tracix'

export function createKanikouLogger(level: LogLevel = LogLevel.INFO): Logger {
  const fileTransport = new FileTransport()
  fileTransport.level = level

  return new Logger('kanikou', {
    transports: [
      new ConsoleTransport({
        formatter: new PrettyFormatter(),
        level
      }),
      fileTransport
    ]
  })
}
