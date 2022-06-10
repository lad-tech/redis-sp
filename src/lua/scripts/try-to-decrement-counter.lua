-- Used as a key for a sorted set of successful acquisition attempts
local shared_resource_key = KEYS[1]

local owner_id = ARGV[1]

local shared_resource_owners_key = shared_resource_key .. ':owners'

-- Try to remove keys from both sorted sets
redis.call('ZREM', shared_resource_key, owner_id)

-- Returns 1 if the lock was properly released, or 0 if it has expired
return redis.call('ZREM', shared_resource_owners_key, owner_id)
