import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { palette, typography } from '@/design-system';
import type { LookDetail } from '@/core/db/dao';
import { CanvasEditor } from '@/features/looks/CanvasEditor';
import { rebuildCover } from '@/features/looks/coverCompose';
import { loadPickCandidates } from '@/features/looks/pickCandidates';
import type { PickCandidate } from '@/features/looks/pickFilter';
import { SlotsEditor } from '@/features/looks/SlotsEditor';

/**
 * 造型编辑器路由（LOK-02/03）：query `mode=slots|canvas`。
 * 保存后跳详情；封面后台合成（失败不阻塞）；未保存退出提示保留草稿
 * （草稿本体由编辑器内 useLookDraft 防抖/unmount 自动落盘）。
 */
export default function LookEditorRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isCanvas = mode === 'canvas';
  const [candidates, setCandidates] = useState<PickCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const savedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    loadPickCandidates()
      .then((c) => {
        if (mounted) setCandidates(c);
      })
      .catch(() => {
        if (mounted) setError('衣物加载失败，请重试');
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 未保存退出（返回手势/按钮）：提示保留草稿；草稿由编辑器自动保存，无需在此再写
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current || savedRef.current) return;
      e.preventDefault();
      Alert.alert('保留草稿？', '有未保存的修改，可存为草稿稍后继续。', [
        { text: '继续编辑', style: 'cancel' },
        {
          text: '存草稿退出',
          onPress: () => navigation.dispatch(e.data.action),
        },
        {
          text: '放弃修改',
          style: 'destructive',
          onPress: () => {
            dirtyRef.current = false;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation]);

  const onSaved = (detail: LookDetail) => {
    savedRef.current = true;
    dirtyRef.current = false;
    // 封面合成失败不阻塞保存、不丢造型（rebuildCover 内部吞错；详情/图库实时渲染兜底）
    rebuildCover(detail.look.id).catch(() => undefined);
    router.replace(`/look/${detail.look.id}`);
  };

  const title = isCanvas ? '自由画布' : '快速槽位';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title }} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : candidates === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.oxblood} />
        </View>
      ) : isCanvas ? (
        <CanvasEditor
          candidates={candidates}
          onSaved={onSaved}
          onDirtyChange={(d) => {
            dirtyRef.current = d;
          }}
        />
      ) : (
        <SlotsEditor
          candidates={candidates}
          onSaved={onSaved}
          onDirtyChange={(d) => {
            dirtyRef.current = d;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paperWhite },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { ...typography.body, color: palette.danger },
});
