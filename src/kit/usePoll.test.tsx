import { act, renderHook } from '@testing-library/react';
import { usePoll } from './usePoll';
import { ReadError } from './read';

const flush = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('usePoll retry delay', () => {
  it('honours a Retry-After longer than the back-off cap', async () => {
    const fetcher = jest.fn().mockRejectedValue(new ReadError('busy', 503, 120_000));
    renderHook(() => usePoll('k', fetcher, 0));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await flush(119_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds a huge Retry-After, and caps the exponential back-off without a hint', async () => {
    const huge = jest.fn().mockRejectedValue(new ReadError('busy', 503, 99 * 3_600_000));
    renderHook(() => usePoll('huge', huge, 0));
    await flush();
    await flush(299_999);
    expect(huge).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(huge).toHaveBeenCalledTimes(2);

    const plain = jest.fn().mockRejectedValue(new ReadError('busy', 503));
    renderHook(() => usePoll('plain', plain, 0));
    await flush();
    await flush(3_000); // 3 s, then 6 s, then 12 s
    expect(plain).toHaveBeenCalledTimes(2);
    await flush(6_000);
    expect(plain).toHaveBeenCalledTimes(3);
    await flush(12_000);
    expect(plain).toHaveBeenCalledTimes(4);
  });
});
