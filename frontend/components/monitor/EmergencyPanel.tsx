import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Loader2, PhoneCall, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useBackend } from '@/hooks/useBackend';
import { useToast } from '@/hooks/use-toast';
import { api, type AlertSettings } from '@/services/api';

const E164 = /^\+[1-9]\d{7,14}$/;

/** Phone-call escalation settings (stored server-side on the user's profile). */
export function EmergencyPanel({ settings, onSaved }: { settings: AlertSettings | null; onSaved: () => void }) {
  const { online, user } = useBackend();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [delay, setDelay] = useState(8);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPhone(settings.phone_number ?? '');
    setContact(settings.emergency_contact ?? '');
    setEnabled(settings.escalation_enabled);
    setDelay(settings.escalation_delay_seconds);
  }, [settings]);

  if (!online || !user) {
    return (
      <p className="text-xs text-muted-foreground">
        If sound and vibration fail to wake you, DrowsiGuard can <b className="text-foreground">phone you</b> — an
        incoming call rings with your phone's own ringtone. This needs the backend:{' '}
        {online ? (
          <Link href="/login" className="text-primary underline-offset-2 hover:underline">sign in</Link>
        ) : (
          'start the FastAPI server and sign in'
        )}{' '}
        to set it up.
      </p>
    );
  }

  const phoneValid = !phone || E164.test(phone);
  const contactValid = !contact || E164.test(contact);

  const save = async () => {
    setBusy('save');
    try {
      await api.updateAlertSettings({
        phone_number: phone || null,
        emergency_contact: contact || null,
        escalation_enabled: enabled,
        escalation_delay_seconds: delay,
      });
      onSaved();
      toast({ title: 'Emergency settings saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await api.escalate({ reason: 'Test call from DrowsiGuard', probability: 0, closure_seconds: 0, test: true });
      toast({ title: res.status === 'simulated' ? 'Test call simulated' : `Test call: ${res.status}`, description: res.message });
    } catch (e) {
      toast({ title: 'Test call failed', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between text-xs">
        <span>Call me if I don't respond to the alarm</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-xs">Your mobile number</Label>
        <Input id="phone" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value.trim())} autoComplete="tel" />
        {!phoneValid && <p className="text-[11px] text-red-400">Use international format, e.g. +919876543210</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact" className="text-xs">Emergency contact (gets an SMS)</Label>
        <Input id="contact" placeholder="optional" value={contact} onChange={(e) => setContact(e.target.value.trim())} />
        {!contactValid && <p className="text-[11px] text-red-400">Use international format</p>}
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <Label>Call after unacknowledged alarm</Label>
          <span className="font-mono text-primary">{delay} s</span>
        </div>
        <Slider value={[delay]} min={3} max={30} step={1} onValueChange={([v]) => setDelay(v)} />
        <p className="text-[11px] text-muted-foreground">Calls after 3 s instead if neither sound nor vibration is working.</p>
      </div>
      {settings && !settings.provider_configured && (
        <p className="rounded-md bg-yellow-400/10 px-2.5 py-2 text-[11px] text-yellow-200">
          Server has no Twilio credentials — calls are <b>simulated</b> and logged. Add them to <code>backend/.env</code> to place real calls.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={save} disabled={!!busy || !phoneValid || !contactValid || (enabled && !phone)}>
          {busy === 'save' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
        </Button>
        <Button size="sm" variant="outline" onClick={test} disabled={!!busy || !settings?.phone_number}>
          {busy === 'test' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="mr-1.5 h-3.5 w-3.5" />} Test call
        </Button>
      </div>
    </div>
  );
}
