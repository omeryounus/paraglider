/** True only in the Devpost / MHCP zip packer. Vite builds stay arcade+portal. */
export const CONTEST =
  import.meta.env.CONTEST === true || import.meta.env.CONTEST === 'true';
