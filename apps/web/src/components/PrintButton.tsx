'use client';
import { Button } from '@nuriva/ui';

export function PrintButton({ label }: { label: string }) {
  return <Button className="no-print" onClick={() => window.print()}>{label}</Button>;
}
