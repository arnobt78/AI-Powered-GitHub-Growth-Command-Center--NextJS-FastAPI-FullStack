import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveEventsProvider } from "@/providers/live-events-provider";

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@/hooks/use-live-events", () => ({ useLiveEvents: vi.fn() }));

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

// vi.mock("sonner", ...) returns the same toast.success fn across every test
// in this file — clear call history between tests so an earlier test's toast
// call can't leak into a later "not.toHaveBeenCalled()" assertion.
afterEach(() => {
  vi.clearAllMocks();
});

describe("LiveEventsProvider welcome toast", () => {
  it("shows a welcome toast with the user's name once authenticated", () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: { name: "Arnob" } } });
    render(<LiveEventsProvider>{null}</LiveEventsProvider>);
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("Arnob"),
      expect.objectContaining({ description: expect.stringContaining("Enjoy browsing") }),
    );
  });

  it("does not show a welcome toast while unauthenticated", () => {
    useSession.mockReturnValue({ status: "unauthenticated", data: null });
    render(<LiveEventsProvider>{null}</LiveEventsProvider>);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
