import {
  applyPrepareShortcut,
  applyReceiveShortcut,
  chooseSourceLoc,
  splitItem,
} from "./detail-actions";
import type { RestockItemRow } from "./detail-utils";
import type { RemissionLineVm } from "./detail-line-vm";

type RemissionLineHiddenActionsProps = {
  requestId: string;
  activeSiteId: string;
  cameFromPrepareQueue: boolean;
  item: RestockItemRow;
  vm: RemissionLineVm;
  canEditPrepareItems: boolean;
  canEditReceiveItems: boolean;
};

export function RemissionLineHiddenActions({
  requestId,
  activeSiteId,
  cameFromPrepareQueue,
  item,
  vm,
  canEditPrepareItems,
  canEditReceiveItems,
}: RemissionLineHiddenActionsProps) {
  const returnOrigin = cameFromPrepareQueue ? "prepare" : "";
  const splitFormId = `split-line-form-${item.id}`;
  const manualLocFormId = `manual-loc-form-${item.id}`;

  return (
    <div>
      {canEditPrepareItems && vm.canSplitLine ? (
        <form id={splitFormId} action={splitItem}>
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="return_origin" value={returnOrigin} />
          <input type="hidden" name="site_id" value={activeSiteId} />
          <input type="hidden" name="split_item_id" value={item.id} />
          <input type="hidden" name="split_quantity" value={vm.suggestedSplitQty} />
        </form>
      ) : null}

      {canEditPrepareItems && !vm.canSplitLine ? (
        <>
          <form id={manualLocFormId} action={chooseSourceLoc}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="choose_loc_item_id" value={item.id} />
          </form>

          {vm.quickLocCandidates.map((candidate) => {
            const formId = `choose-loc-form-${item.id}-${candidate.locationId}`;
            return (
              <form key={formId} id={formId} action={chooseSourceLoc}>
                <input type="hidden" name="request_id" value={requestId} />
                <input type="hidden" name="return_origin" value={returnOrigin} />
                <input type="hidden" name="site_id" value={activeSiteId} />
                <input type="hidden" name="choose_loc_item_id" value={item.id} />
                <input type="hidden" name="choose_loc_location_id" value={candidate.locationId} />
                <input type="hidden" name="choose_loc_mode" value="select_only" />
              </form>
            );
          })}
        </>
      ) : null}

      {canEditPrepareItems ? (
        <>
          <form id={`complete-line-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|complete_line`} />
          </form>
          <form id={`prepare-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|prepare_auto`} />
          </form>
          <form id={`set-partial-prepare-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|set_prepare_partial`} />
          </form>
          <form id={`clear-prepare-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|clear_prepare`} />
          </form>
          <form id={`ship-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|ship_prepared`} />
          </form>
          <form id={`clear-ship-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_shortcut_target" value={`${item.id}|clear_ship`} />
          </form>
        </>
      ) : null}

      {canEditReceiveItems ? (
        <>
          <form id={`receive-all-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_receive_target" value={`${item.id}|receive_all`} />
          </form>
          <form id={`mark-shortage-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_receive_target" value={`${item.id}|mark_shortage`} />
          </form>
          <form id={`clear-receive-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_receive_target" value={`${item.id}|clear_receive`} />
          </form>
          <form id={`set-partial-receive-form-${item.id}`} action={applyReceiveShortcut}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={activeSiteId} />
            <input type="hidden" name="line_receive_target" value={`${item.id}|set_partial`} />
          </form>
        </>
      ) : null}
    </div>
  );
}
