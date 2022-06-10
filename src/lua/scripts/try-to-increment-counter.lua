-- Used as a key for a sorted set of successful acquisition attempts
local shared_resource_key = KEYS[1]

local owner_id = ARGV[1]
local max_shared_resource_owners = tonumber(ARGV[2])
local max_lock_time_millis = tonumber(ARGV[3])
local current_time_millis = tonumber(ARGV[4])

local expired_up_to_millis = current_time_millis - max_lock_time_millis

local acquisition_attempts_counter_key = shared_resource_key .. ':counter'
local shared_resource_owners_key = shared_resource_key .. ':owners'

-- Remove all expired locks from both sorted sets
redis.call('ZREMRANGEBYSCORE', shared_resource_key, '-inf', expired_up_to_millis)
redis.call('ZINTERSTORE', shared_resource_owners_key, 2, shared_resource_owners_key, shared_resource_key, 'WEIGHTS', 1, 0)

-- Increment counter by one and get its current value
local counter = redis.call('INCR', acquisition_attempts_counter_key)

-- Add entries to both sorted sets and try to acquire the lock
redis.call('ZADD', shared_resource_key, current_time_millis, owner_id)
redis.call('ZADD', shared_resource_owners_key, counter, owner_id)

local is_acquired = redis.call('ZRANK', shared_resource_owners_key, owner_id) < max_shared_resource_owners

if is_acquired then
  return 1
end

-- Remove entries from both sorted sets on failure
redis.call('ZREM', shared_resource_key, owner_id)
redis.call('ZREM', shared_resource_owners_key, owner_id)

return 0
