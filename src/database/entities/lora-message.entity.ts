import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('lora_message')
@Index('idx_lora_direction', ['direction'])
@Index('idx_lora_timestamp', ['timestamp'])
export class LoraMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  direction!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'real', nullable: true })
  rssi!: number | null;

  @Column({ type: 'real', nullable: true })
  snr!: number | null;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp!: Date;
}
