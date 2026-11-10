import { describe, expect, it } from 'vitest';
import { offPlatformSignals as s } from './index.js';

describe('off-platform signals in chat messages', () => {
  it('finds phone numbers in common US and Latin American formats, and contact apps', () => {
    for (const t of ['Llámame al 305-555-1234', 'mi cel (786) 555 0199', 'text 305.555.1234', '+1 305 555 1234', '+58 412 1234567', 'escríbeme por WhatsApp', 'add me on instagram']) {
      expect(s(t), t).toContain('phone');
    }
  });
  it('finds emails, also spelled out', () => {
    expect(s('ana.lopez@gmail.com')).toEqual(['email']);
    expect(s('mi correo es ana arroba gmail punto com')).toContain('email');
  });
  it('finds links', () => {
    expect(s('mira https://example.org/x')).toContain('link');
    expect(s('wa.me/13055551234')).toEqual(expect.arrayContaining(['link', 'phone']));
  });
  it('finds off-app payments', () => {
    for (const t of ['¿Te pago por Zelle?', 'Can I pay you with Venmo', 'te pago en efectivo', 'pay me directly next time', 'mejor fuera de la app']) {
      expect(s(t), t).toContain('payment');
    }
  });
  it('does not flag normal care messages', () => {
    for (const t of [
      'Sofía cena a las 7:30 y se duerme a las 20:00.',
      'Llego a las 18:00, estoy en el 1200 Brickell Bay Dr, Apt 14B.',
      'Tiene 4 años y pesa 18 kg.',
      'El total fue $82.50, gracias.',
      'Nos vemos el 11/13/2026 a las 5 pm.',
      'The code for the building is 4512.',
      'Ya cenó y estamos leyendo un cuento.',
      'Perfect, see you on Tuesday!',
    ]) expect(s(t), t).toEqual([]);
  });
});
