<script lang="ts">
	import { page } from '$app/state';

	const headline = $derived(page.status === 410 ? 'This gallery link has expired' : page.status === 404 ? 'Gallery not found' : 'Something went wrong');
</script>

<div class="wrap">
	<h1>{headline}</h1>
	<p>{page.error?.message ?? ''}</p>
</div>

<style>
	.wrap {
		max-width: 540px;
		margin: 20vh auto 0;
		padding: 0 24px;
		text-align: center;
	}
	h1 {
		font-size: 1.7rem;
		margin: 0 0 0.4em;
	}
	p {
		color: var(--text-dim);
		margin: 0;
	}
</style>
