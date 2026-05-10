import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { CommandTextInput } from './CommandTextInput.js';

export interface IntroDialogSubmit {
  ip: string;
  pin: string;
  wss: boolean;
}

interface IntroDialogProps {
  initialIp: string;
  initialPin: string;
  initialWss: boolean;
  onSubmit: (values: IntroDialogSubmit) => void;
  onCancel: () => void;
}

type Field = 'ip' | 'pin' | 'wss' | 'submit';

export function IntroDialog({
  initialIp,
  initialPin,
  initialWss,
  onSubmit,
  onCancel,
}: IntroDialogProps) {
  const [ip, setIp] = useState(initialIp);
  const [pin, setPin] = useState(initialPin);
  const [wss, setWss] = useState(initialWss);
  const [field, setField] = useState<Field>('ip');
  const [error, setError] = useState<string | undefined>(undefined);

  const canSubmit = useMemo(() => ip.trim().length > 0 && pin.trim().length > 0, [ip, pin]);

  function moveField(next: 1 | -1): void {
    const order: Field[] = ['ip', 'pin', 'wss', 'submit'];
    const currentIdx = order.indexOf(field);
    const nextIdx = (currentIdx + next + order.length) % order.length;
    const nextField = order[nextIdx];
    if (nextField) setField(nextField);
  }

  function submitIfValid(): void {
    const nextIp = ip.trim();
    const nextPin = pin.trim();
    if (!nextIp || !nextPin) {
      setError('IP and PIN are required.');
      return;
    }
    setError(undefined);
    onSubmit({ ip: nextIp, pin: nextPin, wss });
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      onCancel();
      return;
    }
    if ((key.leftArrow || key.rightArrow) && field === 'wss') {
      setWss((prev) => !prev);
      return;
    }
    if (key.downArrow || key.tab) {
      moveField(1);
      return;
    }
    if (key.upArrow || (key.shift && key.tab)) {
      moveField(-1);
      return;
    }
    if (key.return) {
      if (field === 'ip') {
        setField('pin');
        return;
      }
      if (field === 'pin') {
        setField('wss');
        return;
      }
      if (field === 'wss') {
        setField('submit');
        return;
      }
      submitIfValid();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>lares4 console setup</Text>
      <Text dimColor>Required env vars are missing. Enter connection settings for this session.</Text>
      <Box marginTop={1} flexDirection="column" borderStyle="round" paddingX={1} paddingY={0}>
        <Box>
          <Text>{field === 'ip' ? '>' : ' '} IP: </Text>
          <CommandTextInput
            value={ip}
            onChange={(value) => {
              if (error) setError(undefined);
              setIp(value);
            }}
            focus={field === 'ip'}
            placeholder="e.g. 192.168.1.10"
          />
        </Box>
        <Box>
          <Text>{field === 'pin' ? '>' : ' '} PIN: </Text>
          <CommandTextInput
            value={pin}
            onChange={(value) => {
              if (error) setError(undefined);
              setPin(value);
            }}
            focus={field === 'pin'}
            mask="*"
            placeholder="panel pin"
          />
        </Box>
        <Box>
          <Text>{field === 'wss' ? '>' : ' '} WSS: </Text>
          <Text inverse={field === 'wss'}>{wss ? 'on (secure websocket)' : 'off (plain websocket)'}</Text>
        </Box>
        <Box>
          <Text>{field === 'submit' ? '>' : ' '} </Text>
          <Text inverse={field === 'submit'}>{canSubmit ? 'Connect' : 'Connect (fill IP and PIN first)'}</Text>
        </Box>
      </Box>
      <Text dimColor>Tab/Shift+Tab or Up/Down to navigate. Enter to continue. Left/Right toggles WSS.</Text>
      {error ? <Text color="red">{error}</Text> : null}
    </Box>
  );
}
