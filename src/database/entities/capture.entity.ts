import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('capture')
@Index('idx_capture_object', ['objectName'])
@Index('idx_capture_timestamp', ['timestamp'])
export class Capture {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  filename!: string;

  @Column({ type: 'text' })
  filePath!: string;

  @Column({ type: 'text' })
  triggerReason!: string;

  @Column({ type: 'text', nullable: true })
  objectName!: string | null;

  @Column({ type: 'real', nullable: true })
  azimuth!: number | null;

  @Column({ type: 'real', nullable: true })
  altitude!: number | null;

  @Column({ type: 'integer' })
  fileSize!: number;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp!: Date;
}
