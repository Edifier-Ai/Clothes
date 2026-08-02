import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { palette, radius } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import { fitCanvasBox } from '@/core/looks/geometry';
import type { CoverSpec } from '@/core/looks/cover';
import { rebuildCoverSpec } from '@/core/looks/lookService';
import { LookComposite } from './LookComposite';

export interface LookCoverProps {
  lookId: string;
  /** cover_rel_path；有缓存文件时直接显示，缺失回退实时渲染。 */
  coverRelPath: string | null;
  width: number;
  height: number;
}

/**
 * 造型封面（LOK-01/05）：优先显示缓存 PNG（expo-image），
 * cover_rel_path 为空或缓存文件已删时回退到 rebuildCoverSpec 实时合成，不崩。
 */
export function LookCover({ lookId, coverRelPath, width, height }: LookCoverProps) {
  const [useCache, setUseCache] = useState<boolean>(false);
  const [spec, setSpec] = useState<CoverSpec | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let cached = false;
      if (coverRelPath) {
        try {
          const info = await FileSystem.getInfoAsync(originalUri(coverRelPath));
          cached = info.exists;
        } catch {
          cached = false;
        }
      }
      if (!mounted) return;
      setUseCache(cached);
      if (!cached) {
        const s = await rebuildCoverSpec(lookId).catch(() => null);
        if (mounted) setSpec(s);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [lookId, coverRelPath]);

  if (useCache && coverRelPath) {
    return (
      // contain：3:4 封面 PNG 嵌入任意卡片框，绝不裁切内容（MVP-008 裁切修复）
      <Image
        source={{ uri: originalUri(coverRelPath) }}
        style={[styles.image, { width, height }]}
        contentFit="contain"
      />
    );
  }
  // 兜底实时合成同样按 3:4 规范画布嵌入卡片框（居中留白），与编辑/封面同一比例
  const fit = fitCanvasBox(width, height);
  return (
    <View style={[styles.fallback, { width, height }]}>
      {spec && fit.w > 0 ? (
        <View style={{ marginLeft: fit.left, marginTop: fit.top }}>
          <LookComposite items={spec.items} width={fit.w} height={fit.h} />
        </View>
      ) : (
        <View style={[styles.blank, { width, height }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: radius.md, backgroundColor: palette.sandSoft },
  fallback: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: palette.paperWhite },
  blank: { backgroundColor: palette.sandSoft },
});
