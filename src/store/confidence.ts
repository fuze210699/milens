import type { AnnotationStore } from './annotations.js';

/** Boost confidence for an annotation, logging the evolution event */
export function boostConfidence(
  store: AnnotationStore,
  annotationId: string,
  increment: number = 0.1,
): void {
  // Get current annotation
  const results = store.recall({ limit: 1000 });
  const ann = results.find(a => a.id === annotationId);
  if (!ann) return;
  const oldConf = ann.confidence;
  const newConf = Math.min(oldConf + increment, 1.0);
  if (newConf !== oldConf) {
    store.logEvolutionEvent(annotationId, 'confidence_up', String(oldConf), String(newConf));
  }
}

/** Decay confidence for stale annotations */
export function decayConfidence(
  store: AnnotationStore,
  annotationId: string,
  decrement: number = 0.1,
): void {
  const results = store.recall({ limit: 1000 });
  const ann = results.find(a => a.id === annotationId);
  if (!ann) return;
  const oldConf = ann.confidence;
  const newConf = Math.max(oldConf - decrement, 0.0);
  if (newConf !== oldConf) {
    store.logEvolutionEvent(annotationId, 'confidence_down', String(oldConf), String(newConf));
  }
}

/** Get stale annotations older than daysOld with confidence below threshold */
export function getStaleAnnotations(
  store: AnnotationStore,
  daysOld: number = 30,
  confidenceThreshold: number = 0.5,
): ReturnType<typeof store.recall> {
  const stale = store.getStaleAnnotations(daysOld, confidenceThreshold);
  return stale;
}

/** Promote high-confidence security annotations to SECURITY.md rules */
export function promoteSecurityAnnotations(
  store: AnnotationStore,
  rootPath: string,
): { promoted: number; content: string } {
  const securityAnnotations = store.recall({ key: 'security', limit: 1000 });
  const promotable = securityAnnotations.filter(a => a.confidence >= 0.8);

  if (promotable.length === 0) return { promoted: 0, content: '' };

  const lines = [
    '## Auto-generated Security Rules (Milens Evolved)',
    `> Generated on ${new Date().toISOString().split('T')[0]} from ${promotable.length} high-confidence annotations`,
    '',
  ];

  for (const ann of promotable) {
    const severity = ann.confidence >= 0.95 ? 'CRITICAL' : ann.confidence >= 0.9 ? 'HIGH' : 'MEDIUM';
    lines.push(`### SEC-${ann.id.slice(0, 8)}: ${ann.symbol} — ${ann.value.slice(0, 80)}`);
    lines.push(`- **Severity:** ${severity}`);
    lines.push(`- **Confidence:** ${(ann.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Pattern:** ${ann.value}`);
    lines.push(`- **Agent:** ${ann.agent || 'unknown'}`);
    lines.push(`- **Last updated:** ${ann.updatedAt}`);
    lines.push('');

    // Log promotion event
    try {
      store.logEvolutionEvent(ann.id, 'promoted', '', `SECURITY.md (${rootPath})`);
    } catch {
      // evolution_log may not exist in older DBs
    }
  }

  return { promoted: promotable.length, content: lines.join('\n') };
}

/** Run full decay pass on all annotations */
export function runDecayPass(store: AnnotationStore): { decayed: number; archived: number } {
  const stale = store.getStaleAnnotations(30, 1.0); // all older than 30 days
  let decayed = 0;
  let archived = 0;
  for (const ann of stale) {
    if (ann.confidence >= 0.9 && ann.updatedAt && new Date(ann.updatedAt).getTime() > Date.now() - 90 * 86400000) {
      // High confidence and recently used — keep
      continue;
    }
    if (ann.confidence < 0.3) {
      store.archiveAnnotation(ann.id);
      archived++;
    } else {
      decayConfidence(store, ann.id, 0.1);
      decayed++;
    }
  }
  return { decayed, archived };
}
