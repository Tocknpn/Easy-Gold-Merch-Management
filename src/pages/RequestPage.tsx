import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TicketForm } from '@/components/TicketForm';

export function RequestPage() {
  const [params] = useSearchParams();
  const qMode = params.get('mode') === 'borrow' ? 'borrow' : 'request';
  const [mode, setMode] = useState<'request' | 'borrow'>(qMode);

  useEffect(() => {
    setMode(qMode);
  }, [qMode]);

  return <TicketForm mode={mode} onModeChange={setMode} />;
}