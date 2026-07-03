import { MODULE_METADATA } from '@nestjs/common/constants';
import { QueueModule } from './queue.module';

// Regression test for AUDIT_VERIFICATION_UI.md Point 1: QueueModule is
// @Global(), but @Global() only makes EXPORTED providers resolvable from
// other modules — a provider declared in `providers` but missing from
// `exports` stays private to QueueModule itself. AppController (declared in
// AppModule, not QueueModule) injects 'DEPLOYMENTS_QUEUE' via
// @Optional() @Inject(...): before this fix, that silently resolved to
// undefined, so /health always reported Redis as "disconnected" regardless
// of its real state. A controller-level unit test that manually provides the
// token (see app.controller.spec.ts) cannot catch this — it bypasses
// QueueModule's real metadata entirely. This test asserts the module wiring
// itself.
describe('QueueModule wiring', () => {
  it('exports the DEPLOYMENTS_QUEUE token so it is resolvable outside QueueModule', () => {
    const exportsList: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      QueueModule,
    );
    expect(exportsList).toContain('DEPLOYMENTS_QUEUE');
  });
});
