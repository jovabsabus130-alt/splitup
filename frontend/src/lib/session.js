export async function logoutUser() {
  try {
    if (window.Clerk?.signOut) {
      await window.Clerk.signOut();
    }
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('splitup_token');
    localStorage.removeItem('splitup_user');
    localStorage.removeItem('splitup_custom_name');
  }
}
