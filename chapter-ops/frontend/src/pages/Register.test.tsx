import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Register from "@/pages/Register";

// Mock the auth store
const mockRegister = vi.fn();
const mockClearError = vi.fn();

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn((selector) => {
    const state = {
      register: mockRegister,
      isLoading: false,
      error: null,
      clearError: mockClearError,
      user: null,
    };
    // Zustand uses selectors; if a function is passed, call it
    if (typeof selector === "function") return selector(state);
    return state;
  }),
}));

// Also mock getState for the post-register redirect check
import { useAuthStore } from "@/stores/authStore";
(useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
  user: null,
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Register page", () => {
  it("renders all form fields", () => {
    renderRegister();

    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
  });

  it("renders the create account button", () => {
    renderRegister();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("shows password requirements checklist", () => {
    renderRegister();
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one digit/i)).toBeInTheDocument();
    expect(screen.getByText(/one special character/i)).toBeInTheDocument();
  });

  it("has a link to sign in page", () => {
    renderRegister();
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows validation errors on empty submit", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole("button", { name: /create account/i }));

    // Should show required field errors (react-hook-form + zod validation)
    expect(await screen.findByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
  });

  it("shows password mismatch error", async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Str0ng!Password1");
    await user.type(screen.getByLabelText(/confirm password/i), "DifferentPassword!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
  });

  it("navigates to onboarding when registering without invite code", async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue(undefined);
    (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
      user: { active_chapter_id: null },
    });

    renderRegister();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Str0ng!Password1");
    await user.type(screen.getByLabelText(/confirm password/i), "Str0ng!Password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await vi.waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        password: "Str0ng!Password1",
        phone: undefined,
        invite_code: undefined,
      });
      expect(mockNavigate).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("navigates to dashboard when registering with invite code", async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue(undefined);
    (useAuthStore as unknown as { getState: () => unknown }).getState = () => ({
      user: { active_chapter_id: "chapter-123" },
    });

    renderRegister();

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Str0ng!Password1");
    await user.type(screen.getByLabelText(/confirm password/i), "Str0ng!Password1");
    await user.type(screen.getByLabelText(/invite code/i), "ABC123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await vi.waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({ invite_code: "ABC123" })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });
});
