import winston from 'winston';

export class StructuredLogger {
  create(missionId: string): winston.Logger {
    return winston.createLogger({
      level: 'info',
      defaultMeta: { mission_id: missionId },
      format: winston.format.json(),
      transports: [new winston.transports.Console({ silent: true })],
    });
  }
}
