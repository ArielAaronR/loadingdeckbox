// Netlify Function: order artwork upload + download (see ../lib/artwork-core.mjs).
import { getStore } from '@netlify/blobs';
import { handle } from '../lib/artwork-core.mjs';

export default async req => handle(req, getStore('order-artwork'));

export const config = { path: '/api/artwork' };
