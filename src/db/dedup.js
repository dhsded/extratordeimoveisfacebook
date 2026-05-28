import crypto from 'crypto';
import { prisma } from './client.js';

/**
 * Verifica se um post já existe e o insere se for novo.
 * image_urls é armazenado como JSON string no SQLite.
 */
export async function deduplicateAndInsert(post) {
  // 1. Verifica pelo post_id
  if (post.post_id) {
    const existing = await prisma.post.findUnique({ where: { post_id: post.post_id } });
    if (existing) return { inserted: false, reason: 'duplicate:post_id' };
  }

  // 2. Verifica pelo hash do conteúdo
  if (post.content_hash) {
    const existing = await prisma.post.findFirst({ where: { content_hash: post.content_hash } });
    if (existing) return { inserted: false, reason: 'duplicate:content_hash' };
  }

  // 3. Verifica combinação telefone + preço + bairro (repostagem)
  if (post.phone && post.price && post.neighborhood) {
    const existing = await prisma.post.findFirst({
      where: { phone: post.phone, price: post.price, neighborhood: post.neighborhood },
    });
    if (existing) return { inserted: false, reason: 'duplicate:phone+price+neighborhood' };
  }

  // Serializa image_urls para JSON string (SQLite não tem array nativo)
  const imageUrls = Array.isArray(post.image_urls)
    ? JSON.stringify(post.image_urls)
    : (post.image_urls || '[]');

  try {
    await prisma.post.create({
      data: {
        post_id:          post.post_id || crypto.randomUUID(),
        group_id:         post.group_id,
        author_name:      post.author_name || null,
        author_profile:   post.author_profile || null,
        content:          post.content || null,
        content_hash:     post.content_hash || null,
        city:             post.city || null,
        neighborhood:     post.neighborhood || null,
        property_type:    post.property_type || null,
        transaction_type: post.transaction_type || null,
        price:            post.price ? parseFloat(post.price) : null,
        bedrooms:         post.bedrooms ? parseInt(post.bedrooms) : null,
        bathrooms:        post.bathrooms ? parseInt(post.bathrooms) : null,
        garage:           post.garage ? parseInt(post.garage) : null,
        area_m2:          post.area_m2 ? parseFloat(post.area_m2) : null,
        phone:            post.phone || null,
        creci:            post.creci || null,
        image_urls:       imageUrls,
        post_url:         post.post_url || null,
        created_at:       post.created_at ? new Date(post.created_at) : null,
      },
    });
    return { inserted: true, reason: 'new' };
  } catch (err) {
    if (err.code === 'P2002') return { inserted: false, reason: 'duplicate:constraint' };
    throw err;
  }
}
