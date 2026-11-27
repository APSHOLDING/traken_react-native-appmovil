import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { logEvent } from '../utils/activityLog';

type State = { hasError: boolean; fatal: boolean };

/**
 * Red de seguridad: si una pantalla falla al dibujarse, la app NO se cierra.
 * Se anota el error en la bitacora, se reintenta sola una vez y, si vuelve a fallar, ofrece reiniciar.
 * Usa colores fijos (no depende del tema) para que funcione aunque lo que falle sea el propio tema.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, fatal: false };
  private crashes: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: { componentStack?: string }) {
    const now = Date.now();
    this.crashes = this.crashes.filter((t) => now - t < 60000);
    this.crashes.push(now);
    try {
      const where = String(info?.componentStack ?? '').trim().split('\n').slice(0, 2).join(' ¦ ');
      logEvent('error_app', { text: `Pantalla falló: ${String(error?.message ?? error)} | ${where}`.slice(0, 700) });
    } catch {
      // nunca estorbar
    }
    if (this.crashes.length <= 1) {
      // Primer fallo: autocorreccion silenciosa (vuelve a intentar a los 0.8 s).
      this.timer = setTimeout(() => this.setState({ hasError: false, fatal: false }), 800);
      logEvent('autocorreccion', { text: 'Una pantalla falló y la app la reintentó sola.' });
    } else {
      this.setState({ fatal: true });
    }
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  private restart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      this.setState({ hasError: false, fatal: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Text style={styles.emoji}>🛠️</Text>
        <Text style={styles.title}>{this.state.fatal ? 'Algo no salió bien' : 'Reparando…'}</Text>
        <Text style={styles.text}>
          {this.state.fatal
            ? 'Ya quedó registrado y no perdiste nada de lo guardado. Toca para continuar.'
            : 'La app se está recuperando sola, un momento.'}
        </Text>
        {this.state.fatal ? (
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false, fatal: false })}>
              <Text style={styles.btnText}>Reintentar</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={this.restart}>
              <Text style={[styles.btnText, { color: '#0f766e' }]}>Reiniciar app</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb', padding: 30, gap: 10 },
  emoji: { fontSize: 44 },
  title: { color: '#16214d', fontSize: 20, fontWeight: '800' },
  text: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { backgroundColor: '#0f766e', borderRadius: 24, paddingHorizontal: 22, height: 46, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#e6f4f2' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
