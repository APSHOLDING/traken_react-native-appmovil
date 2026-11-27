import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '../components/Ionicons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadow } from '../theme/colors';
import {
  clearJustSynced,
  discardOutboxItem,
  getOutboxItems,
  OutboxItem,
  OutboxSummary,
  processOutbox,
  retryOutboxItem,
  startOutboxMonitor,
  subscribeOutbox,
} from '../utils/outbox';
import { getReceipts, hhmmss, onOpenReceipts, onReceiptsChange, Receipt } from '../utils/receipts';
import { useAuth } from '../context/AuthContext';

/**
 * Aviso global del estado de envio: sin internet, acciones pendientes de
 * enviar, "enviado" y acciones que requieren revision. Tocarlo abre la lista
 * con lo que hay en la cola del telefono. Tambien arranca el monitor que
 * reintenta solo al volver la conexion.
 */
export default function PendingSyncBanner() {
  const insets = useSafeAreaInsets();
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;
  const [summary, setSummary] = useState<OutboxSummary>({ pending: 0, failed: 0, syncing: false, justSynced: 0 });
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);

  useEffect(() => startOutboxMonitor(), []);
  useEffect(() => subscribeOutbox(setSummary), []);

  // El "enviado" verde se apaga solo.
  useEffect(() => {
    if (summary.justSynced > 0 && summary.pending === 0 && summary.failed === 0) {
      const t = setTimeout(() => clearJustSynced(), 4000);
      return () => clearTimeout(t);
    }
  }, [summary.justSynced, summary.pending, summary.failed]);

  // Comprobantes de lo que SI se subio (tambien se abre desde Inicio).
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const loadReceipts = useCallback(() => {
    getReceipts(user?.id ?? null).then(setReceipts).catch(() => {});
  }, [user?.id]);
  useEffect(() => {
    loadReceipts();
    return onReceiptsChange(loadReceipts);
  }, [loadReceipts]);
  useEffect(() => onOpenReceipts(() => setOpen(true)), []);

  const refreshItems = useCallback(async () => setItems(await getOutboxItems()), []);
  useEffect(() => {
    if (open) refreshItems();
  }, [open, summary, refreshItems]);

  const showSynced = summary.justSynced > 0 && summary.pending === 0 && summary.failed === 0;
  const idle = !offline && summary.pending === 0 && summary.failed === 0 && !showSynced;

  let icon: keyof typeof Ionicons.glyphMap = 'cloud-offline-outline';
  let tint = '#fde68a';
  let text = 'Sin internet · puedes seguir trabajando';
  if (summary.failed > 0) {
    icon = 'alert-circle-outline';
    tint = '#fca5a5';
    text = `${summary.failed} acción${summary.failed === 1 ? '' : 'es'} requiere${summary.failed === 1 ? '' : 'n'} revisión`;
  } else if (summary.pending > 0) {
    icon = summary.syncing ? 'sync-outline' : offline ? 'cloud-offline-outline' : 'time-outline';
    tint = summary.syncing ? '#7dd3fc' : '#fde68a';
    text = summary.syncing
      ? `Enviando ${summary.pending} pendiente${summary.pending === 1 ? '' : 's'}…`
      : `${offline ? 'Sin internet · ' : ''}${summary.pending} pendiente${summary.pending === 1 ? '' : 's'} por enviar`;
  } else if (showSynced) {
    icon = 'checkmark-circle-outline';
    tint = '#86efac';
    text = `${summary.justSynced} acción${summary.justSynced === 1 ? '' : 'es'} enviada${summary.justSynced === 1 ? '' : 's'} ✓`;
  }

  const hasQueue = summary.pending > 0 || summary.failed > 0 || showSynced;

  return (
    <>
      {!idle && (
      <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable
          style={[styles.pill, shadow.card]}
          onPress={() => hasQueue && setOpen(true)}
          disabled={!hasQueue}
        >
          <Ionicons name={icon} size={16} color={tint} />
          <Text style={styles.pillText}>{text}</Text>
          {hasQueue && <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.6)" />}
        </Pressable>
      </View>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Envíos</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.navy} />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>
              Se guardaron en este teléfono con la hora en que los hiciste. Se envían solos, en orden, y nunca se
              repiten.
            </Text>

            <ScrollView style={{ maxHeight: 380 }}>
              {items.length === 0 ? (
                <Text style={styles.empty}>No hay nada pendiente de enviar. ✓</Text>
              ) : (
                items.map((it) => (
                  <View key={it.id} style={[styles.item, it.status === 'failed' && styles.itemFailed]}>
                    <Text style={styles.itemLabel}>{it.label}</Text>
                    <Text style={styles.itemMeta}>
                      Hecho el {new Date(it.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {it.status === 'pending' ? ' · esperando conexión' : ''}
                    </Text>
                    {it.status === 'failed' && (
                      <>
                        <Text style={styles.itemError}>{it.lastError ?? 'El servidor no aceptó la operación.'}</Text>
                        <View style={styles.itemActions}>
                          <Pressable style={styles.btnPrimary} onPress={() => retryOutboxItem(it.id)}>
                            <Text style={styles.btnPrimaryText}>Reintentar</Text>
                          </Pressable>
                          <Pressable
                            style={styles.btnGhost}
                            onPress={() =>
                              Alert.alert('Descartar', 'Esta acción NO se enviará y se perderá. ¿Descartarla?', [
                                { text: 'Cancelar', style: 'cancel' },
                                { text: 'Descartar', style: 'destructive', onPress: () => discardOutboxItem(it.id) },
                              ])
                            }
                          >
                            <Text style={styles.btnGhostText}>Descartar</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            <Text style={[styles.sheetTitle, { fontSize: 14, marginTop: 14 }]}>✓ Enviados (comprobantes)</Text>
            <Text style={styles.sheetSub}>Lo que el servidor sí recibió, con la hora en que lo capturaste y la hora en que se subió.</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {receipts.length === 0 ? (
                <Text style={styles.empty}>Aquí aparecerán tus envíos confirmados.</Text>
              ) : (
                receipts.slice(0, 15).map((r) => (
                  <View key={r.id} style={styles.item}>
                    <Text style={styles.itemLabel}>✓ {r.label}</Text>
                    <Text style={styles.itemMeta}>
                      {r.viaQueue
                        ? `Capturado ${new Date(r.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${hhmmss(r.createdAt)} (sin internet) · Subido ${hhmmss(r.syncedAt)}`
                        : `Subido al instante · ${new Date(r.syncedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} ${hhmmss(r.syncedAt)}`}
                    </Text>
                    <Text style={styles.itemMeta}>Servidor: {r.msg}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            {summary.pending > 0 && (
              <Pressable style={[styles.btnPrimary, { marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }]} onPress={() => processOutbox()}>
                <Text style={styles.btnPrimaryText}>{summary.syncing ? 'Enviando…' : 'Enviar ahora'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 998, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pillText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: radii.card, padding: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: colors.navy, fontSize: 17, fontWeight: '800' },
  sheetSub: { color: '#64748b', fontSize: 12.5, marginTop: 6, marginBottom: 12 },
  empty: { color: '#64748b', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  item: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12, marginBottom: 8 },
  itemFailed: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  itemLabel: { color: colors.navy, fontSize: 13.5, fontWeight: '700' },
  itemMeta: { color: '#64748b', fontSize: 11.5, marginTop: 3 },
  itemError: { color: '#b91c1c', fontSize: 12, marginTop: 6 },
  itemActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnPrimary: { backgroundColor: colors.navy, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnGhost: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: '#cbd5e1' },
  btnGhostText: { color: '#475569', fontWeight: '700', fontSize: 13 },
});
