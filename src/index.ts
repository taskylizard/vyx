import 'dotenv/config';
import './suppress-node-warnings';
import { Client } from './framework';

const client = new Client();
await client.start();
