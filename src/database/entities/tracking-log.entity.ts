import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('tracking_log')
@Index('idx_tracking_name_timestamp', ['objectName', 'timestamp'])
@Index('idx_tracking_timestamp', ['timestamp'])
export class TrackingLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  objectName!: string;

  @Column({ type: 'text' })
  objectType!: string;

  @Column({ type: 'real' })
  azimuth!: number;

  @Column({ type: 'real' })
  altitude!: number;

  @Column({ type: 'real', nullable: true })
  distanceKm!: number | null;

  @Column({ type: 'boolean' })
  isVisible!: boolean;

  @Column({ type: 'boolean', nullable: true })
  illuminated!: boolean | null;

  @Column({ type: 'integer' })
  servoAzimuth!: number;

  @Column({ type: 'integer' })
  servoAltitude!: number;

  @Column({ type: 'real', nullable: true })
  angularRate!: number | null;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp!: Date;
}
